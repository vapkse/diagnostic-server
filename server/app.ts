import { json } from 'body-parser';
import express, { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { catchError, combineLatestWith, delay, filter, map, mergeMap, mergeWith, Observable, of, share, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs';
import { Server } from 'socket.io';

import { ClientsSocketService } from './clients-socket.service';
import { shareReplayLast, subscribeWith } from './common/custom-operators';
import { caPath, certPath, env, httpPort, httpsPort, keyPath } from './config';
import { Logger } from './logger.service';
import { NowPlayingService } from './now-playing.service';
import { RouteService } from './route.service';
import { SerialPortsService } from './serial-ports.service';

export const serve = () => {
    const app = express();

    Logger.init(env);

    app.use(json());
    app.use(json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json

    app.all('*', (_req: Request, res: Response, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'POST');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    const serialPortsService = SerialPortsService.getInstance();

    // Create a message stream for amplifiers
    const portStream$ = serialPortsService.ports$.pipe(
        mergeMap(port => port.responseStream$.pipe(
            filter(response => response.msg === 100),
            takeUntil(port.disconnected$)
        ))
    );

    const clientHttpsSocket$ = of({ keyPath, certPath, caPath }).pipe(
        map(paths => {
            const certFiles = {
                key: paths.keyPath && readFileSync(paths.keyPath),
                cert: paths.certPath && readFileSync(paths.certPath),
                ca: paths.caPath && readFileSync(paths.caPath)
            };
            if (!certFiles.ca || !certFiles.cert || !certFiles.key) {
                Logger.log('System', 'white', 'Application', 'No certificate for HTTPS server, only HTTP server wil start.');
                return undefined as never;
            }
            return certFiles;
        }),
        map(certificates => {
            if (certificates) {
                return new Observable<ClientsSocketService>(observer$ => {
                    const httpsServer = createHttpsServer(certificates, app);
                    httpsServer.listen(httpsPort, () => {
                        process.title = 'Diagnostic HTTPS Server';
                        Logger.log('System', 'green', 'Application', `Diagnostic HTTPS server listening on port ${httpsPort}`);

                        const io = new Server(httpsServer, {
                            cors: {
                                origin: '*'
                            }
                        });
                        observer$.next(new ClientsSocketService(io));
                    });
                }).pipe(
                    share()
                );
            } else {
                return of(undefined);
            }
        }),
        catchError((err: unknown) => {
            Logger.logError('System', 'green', 'Application', err as Error);
            return of(of(undefined));
        }),
        shareReplayLast(),
        switchMap(httpsClientsSocket$ => httpsClientsSocket$)
    );

    const httpServer = createServer(app);
    const clientHttpSocket$ = new Observable<ClientsSocketService>(observer$ => {
        httpServer.listen(httpPort, () => {
            process.title = 'Diagnostic HTTP Server';
            Logger.log('System', 'green', 'Application', `Diagnostic HTTP server listening on port ${httpPort}`);

            const io = new Server(httpServer, {
                cors: {
                    origin: '*'
                }
            });

            observer$.next(new ClientsSocketService(io));
        });
    }).pipe(
        share()
    );

    const publishAmpData$ = portStream$.pipe(
        map(response => ({ event: 'ampdata', response }))
    );

    const nowPlayingService = NowPlayingService.getInstance();
    const publishNowPlaying$ = nowPlayingService.response$.pipe(
        map(response => ({ event: 'nowplaying', response }))
    );

    const createServers$ = clientHttpSocket$.pipe(
        combineLatestWith(clientHttpsSocket$),
        delay(3000),
        shareReplayLast()
    );

    const publish$ = () => publishAmpData$.pipe(
        mergeWith(publishNowPlaying$),
        withLatestFrom(createServers$),
        tap(([datas, [http, https]]) => {
            if (datas.response) {
                void http.send(datas);
                void https?.send(datas);
            }
        })
    );

    const initRoutes$ = () => RouteService.getInstance(app, serialPortsService).initRoutes$();

    createServers$.pipe(
        subscribeWith(initRoutes$(), publish$())
    ).subscribe();

    process.on('uncaughtException', (e: Error) => {
        const msg = (!e.message && !e.stack && JSON.stringify(e)) || e.message || e.stack;
        Logger.log('Process', 'red', 'Application', String(msg));
    });
};
