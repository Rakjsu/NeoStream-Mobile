/**
 * i18n do app (fase 1: navegação, descoberta e player). Dicionário
 * chave-idêntico em pt/en/es — a paridade é testada, no mesmo espírito do
 * webRemoteStrings do desktop. Idioma vem do sistema (expo-localization).
 */
import { getLocales } from 'expo-localization'

export type Lang = 'pt' | 'en' | 'es'

export const STRINGS = {
    pt: {
        tabHome: 'Início', tabLive: 'TV ao vivo', tabMovies: 'Filmes', tabSeries: 'Séries', tabSearch: 'Buscar', tabSettings: 'Ajustes',
        loginSubtitleXtream: 'Entre com os dados da sua lista IPTV (Xtream)', loginSubtitleM3u: 'Cole a URL da sua lista M3U',
        modeXtream: 'Xtream', modeM3u: 'Lista M3U', serverLabel: 'Servidor', m3uLabel: 'URL da lista M3U',
        userLabel: 'Usuário', passLabel: 'Senha', userPh: 'usuário', passPh: 'senha', signIn: 'Entrar',
        loginHint: 'Seus dados ficam só neste aparelho e são usados apenas pra falar com o seu provedor.',
        loginFail: 'Falha ao conectar no servidor.',
        searchChannel: 'Buscar canal…', searchMovie: 'Buscar filme…', searchSeries: 'Buscar série…', searchAll: 'Buscar em tudo…',
        all: 'Todos', favoritesChip: '❤ Favoritos', continueRail: '⏯ Continuar assistindo',
        loadingChannels: 'Carregando canais…', loadingMovies: 'Carregando filmes…', loadingSeries: 'Carregando séries…',
        loadingCatalog: 'Carregando catálogo…', loadingHome: 'Preparando a Home…',
        failChannels: 'Falha ao carregar os canais.', failMovies: 'Falha ao carregar os filmes.',
        failSeries: 'Falha ao carregar as séries.', failCatalog: 'Falha ao carregar o catálogo.', failHome: 'Falha ao carregar a Home.',
        noChannels: 'Nenhum canal na lista.', noChannelFound: 'Nenhum canal encontrado.',
        noFavChannels: 'Nenhum canal favorito ainda — toque no ❤ de um canal.',
        noMovies: 'Nenhum filme na lista.', noMovieFound: 'Nenhum filme encontrado.',
        noFavMovies: 'Nenhum filme favorito ainda — segure um pôster pra favoritar.',
        noSeries: 'Nenhuma série na lista.', noSeriesFound: 'Nenhuma série encontrada.',
        noFavSeries: 'Nenhuma série favorita ainda — segure um pôster pra favoritar.',
        searchPrompt: 'Digite pra buscar em canais, filmes e séries de uma vez.', searchNothing: 'Nada encontrado.',
        secChannels: '📺 Canais', secMovies: '🎬 Filmes', secSeries: '🎞️ Séries',
        favRail: '❤ Favoritos', favChannelsRail: '📺 Canais favoritos', newMoviesRail: '🆕 Filmes adicionados', newSeriesRail: '🆕 Séries atualizadas',
        homeEmpty: 'Assista e favorite pra Home ganhar vida.',
        updateBanner: 'Versão {version} disponível — toque pra baixar',
        removeContinueTitle: 'Continuar assistindo', removeContinueMsg: 'Remover "{title}" do rail?',
        cancel: 'Cancelar', remove: 'Remover', nextUp: 'A seguir: ',
        sortDefault: 'Padrão', sortRecent: 'Recentes', sortAz: 'A–Z', sortRating: 'Nota',
        playError: 'Não deu pra reproduzir este conteúdo.',
        playErrorHint: 'O formato pode não ser suportado ou o servidor está fora do ar.',
        subtitleOff: '💬 Legenda desligada', audioN: 'Áudio {n}', subtitleN: 'Legenda {n}',
    },
    en: {
        tabHome: 'Home', tabLive: 'Live TV', tabMovies: 'Movies', tabSeries: 'Series', tabSearch: 'Search', tabSettings: 'Settings',
        loginSubtitleXtream: 'Sign in with your IPTV (Xtream) account', loginSubtitleM3u: 'Paste your M3U playlist URL',
        modeXtream: 'Xtream', modeM3u: 'M3U playlist', serverLabel: 'Server', m3uLabel: 'M3U playlist URL',
        userLabel: 'Username', passLabel: 'Password', userPh: 'username', passPh: 'password', signIn: 'Sign in',
        loginHint: 'Your credentials stay on this device and are only used to talk to your provider.',
        loginFail: 'Could not connect to the server.',
        searchChannel: 'Search channel…', searchMovie: 'Search movie…', searchSeries: 'Search series…', searchAll: 'Search everything…',
        all: 'All', favoritesChip: '❤ Favorites', continueRail: '⏯ Continue watching',
        loadingChannels: 'Loading channels…', loadingMovies: 'Loading movies…', loadingSeries: 'Loading series…',
        loadingCatalog: 'Loading library…', loadingHome: 'Preparing Home…',
        failChannels: 'Failed to load channels.', failMovies: 'Failed to load movies.',
        failSeries: 'Failed to load series.', failCatalog: 'Failed to load the library.', failHome: 'Failed to load Home.',
        noChannels: 'No channels in the list.', noChannelFound: 'No channel found.',
        noFavChannels: 'No favorite channels yet — tap a channel’s ❤.',
        noMovies: 'No movies in the list.', noMovieFound: 'No movie found.',
        noFavMovies: 'No favorite movies yet — long-press a poster to favorite.',
        noSeries: 'No series in the list.', noSeriesFound: 'No series found.',
        noFavSeries: 'No favorite series yet — long-press a poster to favorite.',
        searchPrompt: 'Type to search channels, movies and series at once.', searchNothing: 'Nothing found.',
        secChannels: '📺 Channels', secMovies: '🎬 Movies', secSeries: '🎞️ Series',
        favRail: '❤ Favorites', favChannelsRail: '📺 Favorite channels', newMoviesRail: '🆕 Recently added movies', newSeriesRail: '🆕 Recently updated series',
        homeEmpty: 'Watch and favorite to bring Home to life.',
        updateBanner: 'Version {version} available — tap to download',
        removeContinueTitle: 'Continue watching', removeContinueMsg: 'Remove "{title}" from the rail?',
        cancel: 'Cancel', remove: 'Remove', nextUp: 'Up next: ',
        sortDefault: 'Default', sortRecent: 'Recent', sortAz: 'A–Z', sortRating: 'Rating',
        playError: 'Could not play this content.',
        playErrorHint: 'The format may be unsupported or the server is down.',
        subtitleOff: '💬 Subtitles off', audioN: 'Audio {n}', subtitleN: 'Subtitle {n}',
    },
    es: {
        tabHome: 'Inicio', tabLive: 'TV en vivo', tabMovies: 'Películas', tabSeries: 'Series', tabSearch: 'Buscar', tabSettings: 'Ajustes',
        loginSubtitleXtream: 'Ingresa los datos de tu lista IPTV (Xtream)', loginSubtitleM3u: 'Pega la URL de tu lista M3U',
        modeXtream: 'Xtream', modeM3u: 'Lista M3U', serverLabel: 'Servidor', m3uLabel: 'URL de la lista M3U',
        userLabel: 'Usuario', passLabel: 'Contraseña', userPh: 'usuario', passPh: 'contraseña', signIn: 'Entrar',
        loginHint: 'Tus datos se quedan en este dispositivo y solo se usan para hablar con tu proveedor.',
        loginFail: 'No se pudo conectar al servidor.',
        searchChannel: 'Buscar canal…', searchMovie: 'Buscar película…', searchSeries: 'Buscar serie…', searchAll: 'Buscar en todo…',
        all: 'Todos', favoritesChip: '❤ Favoritos', continueRail: '⏯ Seguir viendo',
        loadingChannels: 'Cargando canales…', loadingMovies: 'Cargando películas…', loadingSeries: 'Cargando series…',
        loadingCatalog: 'Cargando catálogo…', loadingHome: 'Preparando el Inicio…',
        failChannels: 'Error al cargar los canales.', failMovies: 'Error al cargar las películas.',
        failSeries: 'Error al cargar las series.', failCatalog: 'Error al cargar el catálogo.', failHome: 'Error al cargar el Inicio.',
        noChannels: 'No hay canales en la lista.', noChannelFound: 'No se encontró ningún canal.',
        noFavChannels: 'Aún no hay canales favoritos — toca el ❤ de un canal.',
        noMovies: 'No hay películas en la lista.', noMovieFound: 'No se encontró ninguna película.',
        noFavMovies: 'Aún no hay películas favoritas — mantén pulsado un póster.',
        noSeries: 'No hay series en la lista.', noSeriesFound: 'No se encontró ninguna serie.',
        noFavSeries: 'Aún no hay series favoritas — mantén pulsado un póster.',
        searchPrompt: 'Escribe para buscar canales, películas y series a la vez.', searchNothing: 'Nada encontrado.',
        secChannels: '📺 Canales', secMovies: '🎬 Películas', secSeries: '🎞️ Series',
        favRail: '❤ Favoritos', favChannelsRail: '📺 Canales favoritos', newMoviesRail: '🆕 Películas añadidas', newSeriesRail: '🆕 Series actualizadas',
        homeEmpty: 'Mira y marca favoritos para dar vida al Inicio.',
        updateBanner: 'Versión {version} disponible — toca para descargar',
        removeContinueTitle: 'Seguir viendo', removeContinueMsg: '¿Quitar "{title}" de la fila?',
        cancel: 'Cancelar', remove: 'Quitar', nextUp: 'A continuación: ',
        sortDefault: 'Estándar', sortRecent: 'Recientes', sortAz: 'A–Z', sortRating: 'Nota',
        playError: 'No se pudo reproducir este contenido.',
        playErrorHint: 'El formato puede no ser compatible o el servidor está caído.',
        subtitleOff: '💬 Subtítulos apagados', audioN: 'Audio {n}', subtitleN: 'Subtítulo {n}',
    },
} satisfies Record<Lang, Record<string, string>>

export type StringKey = keyof typeof STRINGS['pt']

/** Modo de ordenação → chave de string (o botão das grades usa t(SORT_KEY[mode])). */
export const SORT_KEY = {
    default: 'sortDefault',
    recent: 'sortRecent',
    az: 'sortAz',
    rating: 'sortRating',
} as const satisfies Record<string, StringKey>

/** Idioma do app a partir do código do sistema (PURO, testável). */
export function detectLang(languageCode: string | null | undefined): Lang {
    if (languageCode === 'pt') return 'pt'
    if (languageCode === 'es') return 'es'
    return 'en'
}

const lang: Lang = detectLang(getLocales()[0]?.languageCode)

export function currentLang(): Lang {
    return lang
}

export function t(key: StringKey): string {
    return STRINGS[lang][key]
}

/** t() com placeholders: tf('updateBanner', { version: 'v0.4.0' }). */
export function tf(key: StringKey, vars: Record<string, string | number>): string {
    let text = t(key)
    for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
}
