import { catchError, debounceTime, delay, delayWhen, filter, interval, map, mergeWith, Observable, of, repeat, retry, share, skip, switchMap, take, tap, throwError, timer } from 'rxjs';
import SerialPort, { UpdateOptions } from 'serialport';
import struct from 'struct';

import { AmpDataHeader, AmpErrors, AmpInfo, AmpInfoInterface, AmpParamsRequest, AmpRequest, AmpRequestResponse, AmpResponse, FieldInfo, serialBufferMaxLength } from './common/amp';
import { shareReplayLast } from './common/custom-operators';
import { Logger } from './logger.service';


// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
const ampList = require('../assets/amplist.json').amplist as { [id: number]: AmpInfoInterface };

const ampInfos = Object.keys(ampList).reduce((m, key) => m.set(+key, new AmpInfo(ampList[+key])), new Map<number, AmpInfo>());

const hdr1 = 6;
const hdr2 = 133;

ampInfos.forEach(amp => {
    // Merge values with inherits if exists
    const baseSection = amp.inherits && ampInfos.get(amp.inherits);
    if (baseSection) {
        amp.merge(baseSection);
    }
});

export class SerialPortService {
    public responseStream$: Observable<AmpRequestResponse>;
    public response$: Observable<AmpRequestResponse>;
    public disconnected$: Observable<string>;

    private requestStack = new Map<string, AmpRequest>();

    private port$: Observable<SerialPort>;

    public constructor(public portOrIp: string, serialOptions?: UpdateOptions) {
        const requestStruct = struct()
            .word8('hdr1')
            .word8('hdr2')
            .word8('length')
            .word8('id')
            .word8('msg')
            .word8('value')
            .word8('checksum')
            .allocate();

        const responseStruct = struct<AmpResponse>()
            .word8('id')
            .word8('msg')
            .word8('errorNumber')
            .word8('extraValue')
            .allocate();

        const openPort$ = (): Observable<SerialPort> => new Observable<SerialPort>(observer$ => {
            // *********** ATTENTION: Si erreur de compile ici, modifier le .d.ts ***********
            const serport = new SerialPort(portOrIp, serialOptions, error => {
                if (error) {
                    observer$.error(error);
                } else if (!serport.readable && !serport.open) {
                    error = new Error('Port not readable');
                    observer$.error(error);
                } else {
                    Logger.log('System', 'green', `SerialPort ${portOrIp}`, 'Serial port opened');
                    observer$.next(serport);
                }
            });

            serport.open((): void => {
                Logger.log('System', 'green', `SerialPort ${portOrIp}`, `Open port ${portOrIp}.`);
            });
        }).pipe(
            delay(3000),
            retry(10), // Try 10 times to reconnect if there is a connection error
            catchError((err: unknown) => {
                Logger.log('System', 'red', `SerialPort ${portOrIp}`, `Error opening port ${String(err)}`);
                return throwError(() => err);
            })
        );

        const keepAlive$ = interval(2000).pipe(
            switchMap(() => this.port$.pipe(
                take(1)
            )),
            filter(port => !port || !port.readable || !port.open),
            switchMap(() => {
                Logger.log('System', 'yellow', `SerialPort ${portOrIp}`, 'Port reopened from keepAlive');
                return openPort$().pipe(
                    take(1)
                );
            })
        );

        this.port$ = openPort$().pipe(
            mergeWith(keepAlive$),
            shareReplayLast()
        );

        const portData$ = this.port$.pipe(
            switchMap(serport => new Observable<ReadonlyArray<number>>(observer$ => {
                serport.on('data', (datas: ReadonlyArray<number>) => {
                    observer$.next(datas);
                });
            })),
            share()
        );

        const portError$ = this.port$.pipe(
            switchMap(serport => new Observable<Error>(observer$ => {
                serport.on('error', (error: Error) => {
                    Logger.log('System', 'green', `SerialPort ${portOrIp}`, `Serial port error: ${error.message}`);
                    observer$.next(error);
                });
            })),
            share()
        );

        const portClosed$ = this.port$.pipe(
            switchMap(serport => new Observable<string>(observer$ => {
                serport.on('close', () => {
                    Logger.log('System', 'white', `SerialPort ${portOrIp}`, 'Port closed (e).');
                    observer$.next(portOrIp);
                });

                serport.on('disconnect', () => {
                    Logger.log('System', 'white', `SerialPort ${portOrIp}`, 'Port disconnected.');
                    observer$.next(portOrIp);
                });

            })),
            share()
        );

        const getStructLength = (s: unknown): number => (s as { length(): number }).length();

        const sendRequest$ = (serialPort: SerialPort, request: AmpRequest): Observable<void> => new Observable(observer$ => {
            // Request unit
            requestStruct.set('hdr1', hdr1);
            requestStruct.set('hdr2', hdr2);

            const length = getStructLength(requestStruct) - 4;
            let crc = length;
            requestStruct.set('length', length);

            requestStruct.set('id', request.id);
            crc ^= request.id;

            requestStruct.set('msg', request.msg);
            crc ^= request.msg;

            requestStruct.set('value', request.value);
            crc ^= request.value;

            requestStruct.set('checksum', crc);

            serialPort.write(requestStruct.buffer(), (error: Error | null | undefined) => {
                if (error) {
                    observer$.error(error);
                }

                if (request.msg !== 100) {
                    Logger.log('System', 'grey', `SerialPort ${portOrIp}`, `Request sent -> ${JSON.stringify(request)}`);
                }
                observer$.next();
            });
        });

        const listen$ = (): Observable<ReadonlyArray<number>> => {
            const rcvstack = new Array<number>();
            let responseStack = new Array<number>();
            let responseLength = 0;

            const receive = (stack: Array<number>): boolean => {
                // start off by looking for the header bytes. If they were already found in a previous call, skip it.
                if (responseLength === 0) {
                    // this size check may be redundant due to the size check below, but for now I'll leave it the way it is.
                    if (stack.length >= getStructLength(responseStruct)) {
                        // this will block until a 0x06 is found or buffer size becomes less then 3.
                        let data = stack.shift();
                        while (data !== 0x06) {
                            // This will trash any preamble junk in the serial buffer
                            // but we need to make sure there is enough in the buffer to process while we trash the rest
                            // if the buffer becomes too empty, we will escape and try again on the next call
                            if (stack.length < 3) {
                                return false;
                            }
                            data = stack.shift();
                        }
                        data = stack.shift();
                        if (data === 0x85) {
                            // make sure that the allocated memory is enough.
                            if (responseLength > serialBufferMaxLength) {
                                Logger.log('System', 'red', `SerialPort ${portOrIp}`, 'Response length more than the allocate buffer');
                                responseLength = 0;
                                return false;
                            }

                            responseLength = stack.shift() || 0;
                            responseStack = new Array<number>();
                        } else {
                            Logger.log('System', 'red', `SerialPort ${portOrIp}`, 'Invalid response header received');
                            responseLength = 0;
                            return false;
                        }
                    }
                }

                // we get here if we already found the header bytes, the struct size matched what we know, and now we are byte aligned.
                if (responseLength !== 0) {
                    while (stack.length && responseStack.length < responseLength) {
                        responseStack.push(stack.shift() || 0);
                    }

                    if (stack.length && responseStack.length === responseLength) {
                        const cs = stack.shift();
                        let receivedcs = responseStack.length;
                        responseStack.forEach(val => {
                            receivedcs ^= val;
                        });

                        if (cs === receivedcs) {
                            // CS good
                            return true;
                        } else {
                            Logger.log('System', 'red', `SerialPort ${portOrIp}`, 'Invalid response checksum received');
                            responseStack = new Array<number>();
                            responseLength = 0;
                            return false;
                        }
                    }
                }

                return false;
            };

            return portData$.pipe(
                filter(datas => {
                    datas.forEach(data => {
                        rcvstack.push(data);
                    });

                    return receive(rcvstack);
                }),
                take(1),
                map(() => responseStack)
            );
        };

        const processBuffer = (request: AmpRequest, stack: ReadonlyArray<number>) => {
            responseStruct.setBuffer(Buffer.from(stack), getStructLength(responseStruct));
            const responseFields = responseStruct.fields;

            const createStruct = (fieldsInfo: ReadonlyArray<FieldInfo>, buffer?: Buffer) => {
                const dataStruct = struct<AmpDataHeader>();
                fieldsInfo.forEach(field => {
                    if (field.fields) {
                        // array
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                        (dataStruct as any)[field.type](field.name, field.fields.length, field.fields?.[0].type);
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                        (dataStruct as any)[field.type](field.name);
                    }
                });
                dataStruct.allocate();

                if (buffer) {
                    dataStruct.setBuffer(Buffer.from(stack), getStructLength(dataStruct));
                }

                return dataStruct;
            };

            let resp: AmpRequestResponse = undefined as never;
            if (responseFields.errorNumber === 57) {
                Logger.log('System', 'gray', `SerialPort ${portOrIp}`, 'Busy, waiting for next request');
                resp = {
                    port: portOrIp,
                    id: request.id,
                    msg: request.msg,
                    error: 'Busy',
                    nextTime: 10
                };

            } else if (responseFields.msg === AmpParamsRequest.get('getData')) {
                // Map to custom datas struct
                // Check errors
                if (responseFields.errorNumber === 51) {
                    // Logger.log('System', 'yellow', `SerialPort ${portOrIp}`, `Received timeout from unit -> ${JSON.stringify(responseFields)}`);
                    // Wait that some datas can arrive late and serial buffer must be empty before a new request
                    resp = {
                        port: portOrIp,
                        id: request.id,
                        msg: request.msg,
                        error: 'Timeout',
                        nextTime: 500
                    };

                } else if (responseFields.errorNumber === 50) {
                    // Logger.log('System', 'gray', `SerialPort ${portOrIp}`, `Received offline from port -> ${responseFields.extraValue}`);
                    resp = {
                        port: portOrIp,
                        id: request.id,
                        msg: request.msg,
                        error: 'Offline',
                        nextTime: 100
                    };

                } else if (!ampInfos.get(responseFields.id)) {
                    // Logger.log('System', 'white', `SerialPort ${portOrIp}`, `Received datas from unit -> ${JSON.stringify(stack)}`);
                    resp = {
                        port: portOrIp,
                        id: request.id,
                        msg: request.msg,
                        error: 'Unknown',
                        nextTime: 500
                    };
                } else {
                    const ampInfo = ampInfos.get(responseFields.id);
                    if (ampInfo?.dataInfos) {
                        // Map to custom data struct
                        const datas = createStruct(ampInfo.dataInfos, Buffer.from(stack)).fields;
                        // Logger.log('System', 'white', `SerialPort ${portOrIp}`, `Received datas from unit -> ${JSON.stringify(datas)}`);
                        resp = {
                            port: portOrIp,
                            id: datas?.id || request.id,
                            msg: datas?.msg || request.msg,
                            datas,
                            nextTime: 0
                        };
                    }
                }

            } else if (responseFields.errorNumber >= 50) {
                const errors = AmpErrors;
                // Wait that some datas can arrive late and serial buffer must be empty before a new request
                resp = {
                    port: portOrIp,
                    id: request.id,
                    msg: request.msg,
                    error: (errors.get(responseFields.errorNumber) && errors.get(responseFields.errorNumber)?.descr) || 'unknown error',
                    nextTime: 500
                };
                Logger.log('System', 'red', `SerialPort ${portOrIp}`, `resp.json  -> ${JSON.stringify(responseFields)}`);

            } else if (responseFields.msg === AmpParamsRequest.get('getParams')) {
                const ampInfo = ampInfos.get(responseFields.id);
                if (ampInfo?.paramsInfos) {
                    // Map to custom params struct
                    const datas = createStruct(ampInfo.paramsInfos, Buffer.from(stack)).fields;
                    resp = {
                        port: portOrIp,
                        id: datas?.id || request.id,
                        msg: datas?.msg || request.msg,
                        datas,
                        nextTime: 10
                    };
                    // Logger.log('System', 'white', `SerialPort ${portOrIp}`, `Received params from unit -> ${JSON.stringify(resp)}`);
                }

            } else {
                Logger.log('System', 'white', `SerialPort ${portOrIp}`, `Received response from controller -> ${JSON.stringify(responseFields)}`);
                const datas = responseFields as AmpDataHeader;
                resp = {
                    port: portOrIp,
                    id: datas?.id || request.id,
                    msg: datas?.msg || request.msg,
                    datas,
                    nextTime: 0
                };
            }

            if (resp.msg !== 100) {
                if (resp.datas) {
                    Logger.log('System', 'white', `SerialPort ${portOrIp}`, `Received datas from unit -> ${JSON.stringify(resp)}`);
                }
                const key = `${resp.id}#${resp.msg}`;
                this.requestStack.delete(key);
            }
            return resp;
        };

        const closeOnError$ = portError$.pipe(
            skip(10),
            tap(() => {
                Logger.log('System', 'red', `SerialPort ${portOrIp}`, 'Close on multiple errors');
            })
        );

        const closeOnTimeOut$ = portData$.pipe(
            debounceTime(30000),
            tap(() => {
                Logger.log('System', 'red', `SerialPort ${portOrIp}`, 'Close on timeout');
            })
        );

        this.responseStream$ = this.port$.pipe(
            switchMap(port => {
                let request = (this.requestStack.size && Array.from(this.requestStack.values()).at(0)) || undefined as never;
                if (request) {
                    Logger.log('System', 'white', `SerialPort ${portOrIp}`, `send request -> ${JSON.stringify(request)}`);
                }

                if (!request) {
                    request = {
                        id: 0,
                        msg: 100,
                        value: 0
                    } as AmpRequest;
                }

                return sendRequest$(port, request).pipe(
                    switchMap(() => listen$().pipe(
                        map(stack => processBuffer(request, stack))
                    )),
                    catchError((error: unknown) => {
                        Logger.log('System', 'red', `SerialPort ${portOrIp}`, `Error listening port ${String(error)}`);
                        return of({
                            port: portOrIp,
                            id: request.id,
                            msg: request.msg,
                            error,
                            nextTime: 500
                        } as AmpRequestResponse);
                    })
                );
            }),
            take(1),
            delayWhen(resp => timer(resp.nextTime || 0)),
            repeat(),
            share()
        );

        this.response$ = this.responseStream$.pipe(
            share()
        );

        this.disconnected$ = portClosed$.pipe(
            mergeWith(closeOnError$, closeOnTimeOut$),
            take(1),
            switchMap(() => this.close$()),
            catchError((_err: unknown) => {
                Logger.log('System', 'red', `SerialPort ${portOrIp}`, `Error in port observable ${String(_err)}`);
                return of(undefined as never);
            }),
            map(serialPort => {
                if (serialPort) {
                    Logger.log('System', 'red', `SerialPort ${portOrIp}`, 'Complete in port observable');
                }
                return portOrIp;
            })
        );
    }

    public close$(): Observable<SerialPort> {
        return this.port$.pipe(
            take(1),
            tap(port => {
                if (port.isOpen) {
                    Logger.log('System', 'yellow', `SerialPort ${port.path}`, 'Closing port');
                    port.close();
                }
            })
        );
    }

    public sendRequest$(id: number, msg: number, value?: number): Observable<AmpRequestResponse> {
        return this.port$.pipe(
            take(1),
            switchMap(port => {
                if (!port) {
                    return throwError(() => new Error('Port not available.'));
                }

                if (!port.readable) {
                    return throwError(() => new Error('Port not opened.'));
                }

                const request = {
                    id: id,
                    msg: msg,
                    value: value && Math.max(Math.min(value, 255), 0)
                } as AmpRequest;

                const key = `${id}#${msg}`;
                this.requestStack.set(key, request);

                return this.response$.pipe(
                    filter(data => data.id === id && data.msg === msg),
                    take(1)
                );
            })
        );
    }
}
