import { watch } from 'chokidar';
import { readFileSync, statSync } from 'fs';
import got from 'got';
import normalizeUrl from 'normalize-url';
import { catchError, debounceTime, delay, EMPTY, filter, from, map, Observable, of, share, switchMap } from 'rxjs';

import { shareReplayLast } from './common/custom-operators';
import { Artist, NowPlayingResponse } from './common/now-playing';
import { nowPlayingWatch } from './config';
import { Logger } from './logger.service';


interface ArtistResponse {
    artists: ReadonlyArray<Artist>;
}

export class NowPlayingService {
    private static instance: NowPlayingService;

    public response$: Observable<NowPlayingResponse | undefined>;

    private artistsCache = new Map<string, ReadonlyArray<Artist>>();

    private constructor() {
        if (!nowPlayingWatch?.length) {
            this.response$ = EMPTY;
        }

        this.response$ = new Observable(observer$ => {
            const watcher = watch('file', { persistent: true }).on('change', () => observer$.next());
            watcher.add(nowPlayingWatch);
        }).pipe(
            share(),
            debounceTime(2000),
            map(() => {
                // 20 minutes
                let recentTime = Date.now() - 1200000;
                let recentFile = '';
                nowPlayingWatch.forEach(file => {
                    try {
                        const stats = statSync(file);
                        const time = new Date(stats.mtime).getTime();
                        if (time > recentTime) {
                            recentTime = time;
                            recentFile = file;
                        }
                    } catch (err) {
                        Logger.logError('System', 'NowPlaying', `Open file error for file ${file}`, err as Error);
                    }
                });

                if (recentFile) {
                    let data: string;
                    try {
                        data = readFileSync(recentFile, 'utf8')?.trim();
                    } catch (err) {
                        Logger.logError('System', 'NowPlaying', `Read file ${recentFile} error`, err as Error);
                        return {
                            errors: new Array<Error>(new Error(`Read file ${recentFile} error`))
                        } as NowPlayingResponse;
                    }

                    if (!data || !data.startsWith('playing:')) {
                        Logger.log('System', 'gray', 'NowPlaying', 'Sending no artist infos.');
                        return {} as NowPlayingResponse;
                    }

                    const query = data.substr(8).trim();
                    const result = query.split('/');
                    if (result?.length >= 2) {
                        const nowPlaying = {
                            artists: result?.[0].split(';').map(artist => artist.trim()),
                            album: result?.[1]?.trim(),
                            title: result?.[2]?.trim(),
                            artistsInfos: new Array<Artist>(),
                            errors: new Array<Error>()
                        } as NowPlayingResponse;
                        return nowPlaying;
                    }
                }

                return undefined as never;
            }),
            filter(nowPlaying => !!nowPlaying),
            switchMap(nowPlaying => {
                if (nowPlaying.artists?.length) {
                    const getArtistInfos$ = (index: number): Observable<void> => {
                        if (index >= nowPlaying.artists.length) {
                            return of(undefined as void);
                        }

                        const artist = nowPlaying.artists[index];
                        if (this.artistsCache.has(artist)) {
                            Logger.log('System', 'white', 'NowPlaying', `Restoring artist infos from cache for ${artist}`);
                            const fromCache = this.artistsCache.get(artist);
                            if (fromCache) {
                                nowPlaying.artistsInfos.push(...fromCache);
                                return getArtistInfos$(index + 1);
                            }
                        }

                        Logger.log('System', 'magenta', 'NowPlaying', `Sending request for artist infos for ${artist}`);
                        const request = `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist)}`;
                        return from(got(request).json<ArtistResponse>()).pipe(
                            catchError((err: Error) => {
                                Logger.logError('System', 'NowPlaying', `request error for artist ${artist}`, err);
                                nowPlaying.artistsInfos.push({
                                    strArtist: artist,
                                    error: err.message
                                } as Artist);
                                return of(undefined as never);
                            }),
                            map(response => {
                                if (response?.artists) {
                                    this.artistsCache.set(artist, response.artists);
                                    nowPlaying.artistsInfos.push(...response.artists);
                                } else if (response?.artists === null) {
                                    const err = `No informations for artist ${artist}`;
                                    Logger.log('System', 'yellow', 'NowPlaying', err);
                                    nowPlaying.artistsInfos.push({
                                        strArtist: artist
                                    } as Artist);
                                }
                            }),
                            delay(1100), // Waiting 1 seconds to respect theaudiodb rules
                            switchMap(() => getArtistInfos$(index + 1))
                        );
                    };

                    return getArtistInfos$(0).pipe(
                        map(() => {
                            Logger.log('System', 'gray', 'NowPlaying', `Sending artist infos for ${nowPlaying.artists.join(';')}`);

                            const normalize = (url: string): string => url && normalizeUrl(url);

                            nowPlaying.artistsInfos.forEach(artist => {
                                artist.strFacebook = normalize(artist.strFacebook);
                                artist.strTwitter = normalize(artist.strTwitter);
                                artist.strWebsite = normalize(artist.strWebsite);
                                artist.strAudioDB = artist.idArtist && normalize(`https://www.theaudiodb.com/artist/${artist.idArtist}`);
                                artist.strMusicBrainz = artist.strMusicBrainzID && `https://musicbrainz.org/artist/${artist.strMusicBrainzID}`;
                            });

                            return nowPlaying;
                        })
                    );
                }

                return of(nowPlaying);
            }),
            shareReplayLast()
        );
    }

    public static getInstance(): NowPlayingService {
        if (!this.instance) {
            this.instance = new NowPlayingService();
        }

        return this.instance;
    }
}
