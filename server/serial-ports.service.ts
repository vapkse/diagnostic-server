import { debounceTime, filter, from, interval, map, mergeMap, mergeWith, Observable, of, switchMap, take, tap, throwError } from 'rxjs';
import SerialPort from 'serialport';

import { AmpRequestResponse } from './common/amp';
import { serverIds } from './config';
import { SerialPortService } from './serial-port.service';


export class SerialPortsService {
    private static instance: SerialPortsService;

    public ports$: Observable<SerialPortService>;

    // USB Servers
    private availablePorts = new Map<string, SerialPortService>();

    private constructor() {
        if (!serverIds?.length) {
            throw new Error('Serial ports empties serverIds.');
        }

        this.ports$ = interval(1000).pipe(
            mergeMap(() => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                const list = (SerialPort.Binding as any).list() as Promise<ReadonlyArray<SerialPort.PortInfo>>;
                const list$ = from(list);
                return list$.pipe(
                    mergeMap(ports => ports),
                    filter(port => {
                        const portId = port.pnpId;
                        return !!portId && !this.availablePorts.has(port.path) && serverIds.some(id => portId.startsWith(id)) && !serverIds.some(id => (`!${portId}`).startsWith(id));
                    }),
                    mergeMap(port => {
                        const sp = new SerialPortService(port.path, { baudRate: 115200 });
                        this.availablePorts.set(port.path, sp);

                        const disconnected$ = sp.disconnected$.pipe(
                            debounceTime(100),
                            take(1),
                            tap(path => {
                                this.availablePorts.delete(path);
                            }),
                            switchMap(() => sp.close$()),
                            map(() => sp)
                        );

                        return of(sp).pipe(
                            mergeWith(disconnected$)
                        );
                    })
                );
            })
        );
    }

    public static getInstance(): SerialPortsService {
        if (!this.instance) {
            this.instance = new SerialPortsService();
        }

        return this.instance;
    }

    public sendRequest$(port: string, id: number, msg: number, value?: number): Observable<AmpRequestResponse> {
        const serialPort = this.availablePorts.get(port);

        if (!serialPort) {
            return throwError(() => new Error('Port not available.'));
        }

        return serialPort.sendRequest$(id, msg, value).pipe(
            take(1)
        );
    }
}
