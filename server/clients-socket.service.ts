import { Server, Socket } from 'socket.io';

import { NowPlayingResponse } from './common/now-playing';
import { Logger } from './logger.service';


const clients = new Map<string, Client>();

export interface ClientData {
    event: string;
    response: unknown;
}

class Client {
    public constructor(private socket: Socket) { }

    public send(datas: ClientData) {
        this.socket.emit(datas.event, datas.response);
    }
}

export class ClientsSocketService {
    private lastNowPlaying: NowPlayingResponse = undefined as never;

    public constructor(io: Server) {
        io.sockets.on('connection', (socket: Socket) => {
            const client = new Client(socket);
            Logger.log('System', 'cyan', 'Diagnostic', `${socket.id} client connected`);

            socket.on('disconnect', () => {
                clients.delete(socket.id);
                Logger.log('System', 'white', 'Diagnostic', `${socket.id} client disconnected`);
            });

            socket.on('request', (_params: unknown, _callback: () => void) => {
                // eslint-disable-next-line no-debugger
                debugger;
            });

            clients.set(socket.id, client);

            if (this.lastNowPlaying) {
                client.send({ event: 'nowplaying', response: this.lastNowPlaying });
            }
        });
    }

    public send(datas: ClientData): void {
        if (datas.event === 'nowplaying') {
            this.lastNowPlaying = datas.response as NowPlayingResponse;
        }
        Array.from(clients)
            .map(([_key, client]) => client)
            .forEach(client => client.send(datas));
    }
}
