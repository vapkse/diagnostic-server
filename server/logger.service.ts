import colors from 'Colors';
import { Request } from 'express';

export type Colors = 'stripColors' | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray' | 'grey' | 'bgBlack' | 'bgRed' | 'bgGreen' | 'bgYellow' | 'bgBlue' | 'bgMagenta' | 'bgCyan' | 'bgWhite' | 'reset' | 'bold' | 'dim' | 'italic' | 'underline' | 'inverse' | 'hidden' | 'strikethrough' | 'rainbow' | 'zebra' | 'america' | 'trap' | 'random' | 'zalgo';

export type LoggerOptions = string | {
    sessionID?: string;
    req?: Request;
    session?: {
        id: string;
    };
};

export class Logger {
    private static lastError: string;

    public static init(env: string) {
        const clrs = ['white', 'black', 'gray', 'blue', 'cyan', 'green', 'magenta', 'red', 'yellow', 'rainbow'] as ReadonlyArray<Colors>;
        clrs.forEach(color => {
            const clr = colors[color];
            console.log(clr(`Starting express in ${color} mode => ${env}`));
        });
        console.log('');
    }

    public static log(opts: LoggerOptions, color: Colors, namespace: string, txt: string, ...params: ReadonlyArray<string>) {
        let ip = '';
        if (typeof opts !== 'string') {
            const req = opts?.req;
            ip = req?.headers['x-forwarded-for'] as string || req?.socket.remoteAddress || '';
        }

        const paddy = (text: string, n: number, c: string) => {
            const t = text || '';
            return t.length >= n ? t : `${t}${new Array(n - t.length).join(c)}`;
        };

        const replaceParameters = (text: string, parms: ReadonlyArray<string>) => {
            if (parms?.length) {
                const re = /\\([0-9]*)/gm;
                let matches = re.exec(text);
                const output = new Array<string>();
                let start = 0;
                while (matches) {
                    const end = matches.index;
                    if (end > start) {
                        output.push(text.substring(start, end));
                    }

                    // Step \\
                    start = end + 1;
                    if (matches?.[1]) {
                        const iparam = +matches[1];
                        if (!isNaN(iparam)) {
                            // Replace param
                            output.push(parms[iparam]);
                            // Step replacement value
                            start += matches[1].length;
                        }
                    }

                    matches = re.exec(text);
                }

                if (output.length) {
                    output.push(text.substring(start));
                    return output.join('');
                }
            }

            return text;
        };

        const now = new Date();
        let day = String(now.getDate());
        let month = String(now.getMonth() + 1);
        if (day.length === 1) {
            day = `0${day}`;
        }
        if (month.length === 1) {
            month = `0${month}`;
        }

        const textToLog = new Array<string>();
        textToLog.push(`${day}-${month} ${now.toLocaleTimeString()}`);
        textToLog.push(paddy(ip?.substr(7) || '', 16, ' '));
        textToLog.push(paddy(namespace, 16, ' '));
        textToLog.push(replaceParameters(txt, params));

        const s = textToLog.join('  ');
        console.log(colors[color](s));
    }

    public static logError(opts: LoggerOptions, namespace: string, type: string, error: Error) {
        if (!error) {
            return;
        }

        if (Logger.lastError === error.message) {
            return;
        }
        Logger.lastError = error.message;

        if (type === 'info') {
            Logger.log(opts, 'blue', namespace, `Info: ${error.message}`);
        } else if (type === 'warning') {
            Logger.log(opts, 'yellow', namespace, `Warning: ${error.message}`);
        } else {
            Logger.log(opts, 'red', namespace, `Error: ${error.message}`);
        }
    }

    public static logErrors(opts: LoggerOptions, namespace: string, type: string, verrors: ReadonlyArray<Error>) {
        verrors.forEach(error => Logger.logError(opts, namespace, type, error));
    }
}
