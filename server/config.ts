import { join, resolve } from 'path';
export const rootPath = resolve(__dirname);
export const serverIds = [
    'USB\\VID_2341&PID_0010\\95333303131351307172',
    'FTDIBUS\\VID_0403+PID_6001+A600BNUXA\\0000',
    'USB\\VID_1A86&PID_7523\\',
    'usb-1a86_USB2.0-Serial-if00-port0',
    '!USB\\VID_1A86&PID_7523\\5&2108AD5D&0&7'
];
export const httpsPort = 889;
export const httpPort = 890;
export const env = 'development'; // production

const certDirPath = 'C:/Certbot/live/vapkse.gotdns.ch';
export const certPath = join(certDirPath, 'cert.pem');
export const keyPath = join(certDirPath, 'privkey.pem');
export const caPath = join(certDirPath, 'fullchain.pem');

export const nowPlayingWatch = [
    '//CROUILLE3/git/diagnostic-server/now_playing/nowplaying.txt'
];
