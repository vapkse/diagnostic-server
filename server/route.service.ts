import Express, { Application, Request, Response } from 'express';
import { catchError, map, Observable, of, share, switchMap, take } from 'rxjs';

import { AmpParamsRequest } from './common/amp';
import { rootPath } from './config';
import { Logger } from './logger.service';
import { SerialPortsService } from './serial-ports.service';


export interface RequestParams {
    req: Request;
    res: Response;
    next(e: Error | string): void;
}

export class RouteService {
    private static instance: RouteService;

    private lastRequestTime = 0;

    private constructor(private app: Application, private serialPorts: SerialPortsService) { }

    public static getInstance(app: Application, serialPorts: SerialPortsService): RouteService {
        if (!this.instance) {
            this.instance = new RouteService(app, serialPorts);
        }

        return this.instance;
    }

    public initRoutes$() {
        const trafficAnalysis = new Map<string, {
            temporarilyBanned?: number;
            lastNotFound?: number;
            notFoundRequest?: number;
        }>();

        // Error handling
        const logErrors = (error: Error, req: Request, res: Response, next: (err: Error | string) => void) => {
            if (error.name === '404') {
                Logger.log({ req }, 'yellow', 'Route', `404 for url ${req.originalUrl}`);

                const options = {
                    query: req.query
                };

                Logger.log({ req }, 'gray', 'Route', 'Navigate to notfound');
                res.render('notfound.html', options);
                return;
            }

            const logError = (err: Error | string) => {
                if (typeof err === 'string') {
                    Logger.log({ req }, 'red', 'Route', `Express error ${err}`);
                } else if (err.name) {
                    // Validation error
                    Logger.log({ req }, 'red', 'Route', `Express error ${JSON.stringify(err)}`);
                } else if (err.message) {
                    // Node error
                    const name = err.name ? `${err.name}: ` : '';
                    Logger.log({ req }, 'red', 'Route', `Express error ${name}${err.message}`);
                } else if (err instanceof Array) {
                    const errs = [...err];
                    errs.forEach(logError);
                } else {
                    // Unknow type
                    Logger.log({ req }, 'red', 'Route', `Express error ${JSON.stringify(err)}`);
                }
            };

            logError(error);
            next(error);
        };

        const clientErrorHandler = (err: Error, req: Request, res: Response, next: (e: Error | string) => void) => {
            let errstr: string;
            if (typeof err === 'string') {
                errstr = err;
            } else if (err.name || err instanceof Array) {
                // Validation error
                res.json(err);
                return;
            } else if (err.message) {
                // Node error
                errstr = err.message;
            } else {
                // Unknow type
                errstr = 'Server Error';
            }

            if (req.xhr) {
                res.status(500).send(errstr);
            } else {
                next(errstr);
            }
        };

        this.app.use((req, res, next) => {
            const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;
            const clientAnalysis = trafficAnalysis.get(ip);
            if (clientAnalysis?.temporarilyBanned) {
                if (clientAnalysis.temporarilyBanned > Date.now()) {
                    Logger.log({ req }, 'cyan', 'Route', `Forbidden send for ${ip}`);
                    res.status(403).end('Temporarily Banned');
                    return;
                }
                delete clientAnalysis.temporarilyBanned;
            }
            next();
        });

        const ampRequest$ = new Observable<RequestParams>(observer$ => {
            this.app.post('/amprequest', (req, res, next) => {
                observer$.next({ req, res, next });
            });
        }).pipe(
            share(),
            switchMap(params => {
                const { req, res } = params;
                const now = Date.now();

                // Don't allow than one request per seconds on https
                if (req.protocol !== 'http' && (now - this.lastRequestTime) < 1000) {
                    const validationMessage = {
                        message: 'You are not alowed to make a request at this time',
                        type: 'error',
                        name: 'error'
                    };
                    res.status(500).send([validationMessage]);
                    return of(undefined);
                }

                // Only local (http) or getParams() requests are accepted
                const body = req.body as Record<string, string>;
                if (req.protocol !== 'http' && +body.request !== AmpParamsRequest.get('getParams')) {
                    const validationMessage = {
                        message: 'You are not authorized to make a request in https',
                        type: 'error',
                        name: 'error'
                    };
                    res.status(403).send([validationMessage]);
                    return of(undefined);
                }

                if (!body.id) {
                    const validationMessage = {
                        message: 'Requested port is not available',
                        type: 'error',
                        name: 'error'
                    };
                    res.status(500).send([validationMessage]);
                    return of(undefined);
                }

                this.lastRequestTime = Date.now();
                Logger.log({ req }, 'gray', 'ampdRequestApp', `Request for id: ${body.id} ${body.request}`);
                return this.serialPorts.sendRequest$(body.port, +body.id, +body.request, body.value ? +body.value : undefined).pipe(
                    take(1),
                    catchError((error: unknown) => {
                        Logger.log({ req }, 'red', 'ampdRequestApp', `Response error from id ${body.id}: ${String(error)}`);
                        const validationMessage = {
                            message: error as Error,
                            type: 'error',
                            name: 'error'
                        };
                        res.status(500).send([validationMessage]);
                        return of(undefined);
                    }),
                    map(json => {
                        if (json) {
                            Logger.log({ req }, 'gray', 'ampdRequestApp', `Response from id ${body.id}: ${JSON.stringify(json)}`);
                            res.json(json);
                        }
                        return of(undefined);
                    })
                );
            })
        );

        this.app.use(Express.static(rootPath));

        // Last route 404
        this.app.use((req, _res, next) => {
            if (req.url === '/amprequest') {
                next();
                return;
            }

            const err = new Error('Not Found');
            err.name = '404';

            const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;
            let clientAnalysis = trafficAnalysis.get(ip);
            if (!clientAnalysis) {
                trafficAnalysis.set(ip, clientAnalysis = {});
            }
            const now = Date.now();
            if (clientAnalysis.lastNotFound && now - clientAnalysis.lastNotFound < 1000) {
                clientAnalysis.notFoundRequest = clientAnalysis.notFoundRequest ? clientAnalysis.notFoundRequest + 1 : 1;
                if (clientAnalysis.notFoundRequest >= 5) {
                    clientAnalysis.temporarilyBanned = now + 3600000;
                }
            } else {
                delete clientAnalysis.notFoundRequest;
            }
            clientAnalysis.lastNotFound = now;

            next(err);
        });

        this.app.use(logErrors);
        this.app.use(clientErrorHandler);

        return ampRequest$;
    }
}
