<a href="https://kinetune.com/developers/n8n?utm_source=github&utm_medium=readme&utm_campaign=n8n"><img src="https://kinetune.com/og/developers.jpg" alt="Kinetune for n8n: every video, from your workflows" width="100%"></a>

# Kinetune for n8n

[![npm](https://img.shields.io/npm/v/@kinetune/n8n-nodes-kinetune?color=f2cf2e&labelColor=16161d&logo=npm)](https://www.npmjs.com/package/@kinetune/n8n-nodes-kinetune)
[![npm downloads](https://img.shields.io/npm/dm/@kinetune/n8n-nodes-kinetune?color=f2cf2e&labelColor=16161d)](https://www.npmjs.com/package/@kinetune/n8n-nodes-kinetune)
[![License: MIT](https://img.shields.io/badge/license-MIT-f2cf2e?labelColor=16161d)](https://github.com/kinetune/n8n-nodes-kinetune/blob/main/LICENSE.md)

The [Kinetune](https://kinetune.com/?utm_source=github&utm_medium=readme&utm_campaign=n8n) node for [n8n](https://n8n.io): put music videos, lyric videos, Spotify Canvas loops, cover art and AI songs into your workflows. Every operation of the Kinetune app is here, and the node works as a tool for n8n's AI Agent too.

**Ideas for workflows**

- A new song lands in a Drive folder: upload it, make a 9:16 lyric video and a Spotify Canvas, and post them to your socials.
- A label's release calendar: on release day, make each single's lyric video, cover art and music video, and email the artist the links.
- An AI agent in Slack or Telegram that answers *"make a Canvas for my new single"* by quoting the credits and waiting for a yes.
- Write lyrics from an idea, make two takes of the song with AI, then make a video for the take you keep.

Paid operations take the exact credits from a quote first, so a workflow never spends more than you saw.

## Install

In n8n: **Settings → Community nodes → Install**, and enter `@kinetune/n8n-nodes-kinetune`.

## Credentials

Create a **Kinetune API** credential:

- **API Key**: a workspace API key (`kt_live_…`) from the API page in the [Kinetune app](https://kinetune.com/?utm_source=github&utm_medium=readme&utm_campaign=n8n).
- **API Base URL**: `https://kinetune.com` (the default).

n8n tests it by reading your account, so you know right away the key works.

## Make a lyric video for each new song

1. **Kinetune → Song → Create Song** with the audio from a binary property (or **Song Import → Import Songs** from a release link).
2. **Kinetune → Song → Get Song** until `status` is `ready` (a Wait node between tries), or start from songs already analyzed.
3. **Kinetune → Video → Quote Video**: Video Type Lyric Video, the song, the formats. It returns the credits and a `quote_id`.
4. **Kinetune → Video → Create Video** with the same fields and the quote. It returns the video ids at once.
5. **Kinetune → Video → Get Video** with its id until `status` is `completed` (a Wait node between tries): the video holds its download links.

## Every operation

Pick a **Resource** (Account, Artist, Artist Page, Character, Clip, Clip Folder, Cover, Idea, Kit, Look, Music Video Shot List, Song, Song Creation, Song Import, Video), then its **Operation**. Workflows made with version 1 of the node keep their single Operation list.

- **Account**: get the account (the workspace, its plan and credit balance), get the options (lyric styles, visuals, clip moods, transitions and grades, formats, prices)
- **Workspaces** (organizations in the API): list the workspaces of the key's creator (with their type and role; `current` is the key's own), create one they own (an artist's, holding one artist, or a label's, holding a roster), rename the key's workspace or switch its type. The key needs the `organizations:read` or `organizations:write` scope, ticked when it's created; it keeps acting for its own workspace, so choose a plan in a new workspace and create an API key there to work in it
- **Artists**: list (search by name, limit and offset), create, get, rename, archive; set or remove the artist image (their picture on the artist page and in lists, uploaded from a binary property or a link, with an optional square crop); characters (list, start from photos or a finished sheet, draw, keep, discard); face checks (get, start, withdraw, for a model: some models show a real person only once they proved, live on camera, that the face is theirs; one check covers every model that shares it). The artist photo operations and Set Artist Picture were removed in 2.0.0: every video keeps the artist from their character
- **Artist pages**: claim or change the page's address (`kinetune.com/@handle`; **Check Page Address** first, and **Take From My Profile** moves your own username there), get the page (address, status and draft), update the draft (theme, genres and place as fields, any other draft field such as `sections` as JSON; `sections` replaces the whole list), preview it as fans will see it, publish it (owners and admins; only on the user's say-so) or unpublish it (everything is kept), and get its stats (views, visitors, clicks and click rate by day, service, link and referrer). Profiles: list the artist's links on other services (in page order, with the automatic search's state), add one (the service is recognised from the address), order, update (confirm, hide, show, retitle or correct), remove, and find them again (in the background, from the Apple Music connection). Profiles found automatically stay unconfirmed until the user says they are theirs
- **Songs**: list (by artist, search by title or artist name, analysis status, sort by title or newest, limit and offset), upload (audio, square cover art if you have it, and the song's lyrics if you have them; in an artist workspace the artist can be left empty), get, rename, change the cover art (a binary property or a link; videos already made keep theirs, and the old cover stays on the song), get the download links of the cover (full size) and the audio (as uploaded), archive, get the analysis, analyze again, set or remove the song's lyrics (text, or an SRT, WebVTT or LRC file's contents: videos spell every word your way, timed from the audio)
- **Song creation**: write lyrics from an idea (in the artist's world, sized for the model), price a new song, make 1 to 4 takes with Mureka, Lyria, Eleven Music or MiniMax (from your lyrics, the written ones or an instrumental, in a new voice or the artist's own), get a creation and its takes, list them, and keep or clear the Create a song draft. **Artist Voice**: get, set (15 to 30 seconds of the voice, with the singer's consent) or delete it
- **Song import**: bring in released songs from the catalog by id (Kinetune fetches the audio and uses each release's cover), follow each import, or give the audio for one it couldn't fetch
- **Covers**: price a round (1 to 4 covers, and a redraw), make covers (Kinetune's cover art director makes each a different idea for an analysed song: a style or Kinetune's pick, up to two vibes, the artist on it or not, your idea, and words spelled exactly as the song; send the **Credits** Price Covers shows; needs a paid plan), get a round (covers appear as they are drawn, in about a minute; only covers that pass their check are charged), redraw one with a note, list a song's covers (every cover it has had, made or uploaded, kept until deleted), use one (videos already made keep theirs) or delete one
- **Clips**: **Get Song Draft** (the lyric style and clips picture Kinetune picks for a song, at once and without AI); search stock photos and clips (a video to import into one of your folders, or one of a Canvas's **Pexels Video IDs**); list the clips of Stock collections and your folders (length, shape, motion and a preview); **Browse Collection** looks inside one Stock collection (Feelings, Places & textures or Seasons & holidays) a page at a time, by Shape, Energy and Sort; **Similar Clips** finds clips from Stock and your folders that look and move like one clip (no AI, no credits); generate pictures or short clips into your AI folder from a few words, or with **Idea From** the song or its cover, **With** the artist or a cast character, as a video by the **Video Model** you name (its id from Get Options, `video_models.clips`; empty: the default), **Made to Loop** for a Canvas (Credits 0 returns the price; the price shown makes them); **Retry Clip Import** or **Dismiss Clip Import** for one that failed; **Clip as Rebound** plays a clip forward, then backward, as a Canvas Rebound loops it; delete one of your clips; list, create, get, rename and delete clip folders; **Import Clips** cuts a video into clips of 1 to 5 seconds at every scene change, from a YouTube, TikTok or Instagram link, a file URL (Create Upload URL) or a stock video (Search Stock), free
- **Videos**: plan a music video and get a plan; list a plan's opening frames and draw one for a shot (the picture it opens on, paid per picture at the price shown); quote, create, get, list (by song, artist, type or a search over song, artist and music video concept; a page at a time: pass the result's `next_cursor` as **Cursor** for the next page, `counts` says how many match), cancel, retry, delete (lyric videos, Canvases and music videos); make a delivered video public in the Community (a music video's concept reusable by anyone; tick **I Have the Right to Show the People in It Publicly** for a music video and **Kinetune May Post It on Its Socials** only when the person said so) or private again. While a video waits, get and list return `queue`: why (`plan_limit`, with its place in line, or `render_capacity`, with about how long; `generator_capacity` for a music video waiting for a free generator)
- **Community**: suggest an idea for Kinetune, list and search ideas (most voted or newest, by status and area, yours only), get one with its comments, vote for it or take the vote back, follow it (an email when it ships) or stop

Artist and song fields are searchable pickers: **From List** searches as you type and loads more as you scroll (songs show as "Title — Artist", and the song for a quote or video lists only analyzed songs), **By ID** takes an id or an expression.

A **Lyric Video** is made from its song: left as it is, it is the song's draft (Get Song Draft shows it). Change any part of it: **Lyric Style** and **Visual** (the draft's when empty), and **Picture**: the draft's, **Clips** or **Visualizer** (the visual fills the frame). **Headline** is the lyric style's own unless you pick one. Clips are short clips cut on the beat from **Clip Moods** (Stock collections, Get Options: `clip_moods`) and **Clip Folders** (up to six together), with **Cuts** (One Clip, Fewer, Even, More), **Transitions** (Auto, Impact, Flash, Smooth or None, with Amount and Feel from 0 to 1), a **Grade** with its **Grade Strength** (0 to 1), up to three **Effects** (Light leak, God rays, Glow, Vignette, Film burn, Film grain, Old footage, Shake, Mirror, Blur in/out, VHS, Glitch, RGB split), each with a Strength, **Clip Shape**, **Wide Clips Fill** (Cover, Blur or Bars) and **Speed**. **Seed** picks which clips land where (the same seed makes the same video), and **Variations** (1 to 4, clips only) each draw other clips. Nothing is designed by AI: a lyric video costs its setup and render.

A **Canvas (Spotify)** is a 3 to 8 second loop (**Length**, in tenths). **Picture**: **Clips** (Clip Moods, Clip Folders or up to three Pexels Video IDs; left empty, the song's own moods; with a Grade, Wide Clips Fill (or a Fill Colour), Speed, Cut, Seed, Crossfade for a Drift, Camera (Push In, Pull Out) for Rebound and Cuts, Fade at Loop Point for Cuts, Framing Across, Framing Down, Zoom, Rotate and Steady), **Cover** (the song's cover, with Push In, Drift or Still motion), **Visualizer** (a calm visual in the cover's colours) or **Generate With AI** (a picture made for it, **Idea From** the song or the cover, **With** nobody, the artist or a cast character, as a video made to loop (by the Canvas's default model), or a still; it costs more, so quote first). **Loop**: Drift (one clip flowing into itself), Rebound (forward, then back: clips or a generated video) or Cuts (two or three clips, calm cuts: clips). **Clip Best Spot** finds where a clip loops best, **Clip Steadied** gives a clip with its shake smoothed out. **Light** puts a visual over the picture, **Atmosphere** something drifting over it (snow, petals, dust…) and **Effects** up to three effects (the lyric video's, each with a Strength) over any picture, repeating with the loop. Clips take a **Grade Strength** too. From clips, the cover or a visualizer a Canvas costs its setup and render. 5.0.0 replaced the first Canvas maker's fields (Made From, Video Quality, Resolution, Style, Idea From, Direction, Artist in the Visuals, Performer, Stock Photo/Video ID): open a saved Canvas step and pick its Picture again.

A **Music Video** has the song's artist perform it lip-synced, in an AI music video made from their character (**Start Character** first, or the quote fails). Pick a category (the kind: Performance, Cinematic, Story, Surreal and the others Get Options lists), a visual style or Director's Choice, one format, and the whole song or a section of it (15 seconds to 10 minutes), in any quality Get Options lists for the model (left on Model's Default: 768p for MiniMax H3 Max, 720p for Seedance). Model picks MiniMax H3 Max, or Seedance 2.0, 2.0 Fast, 2.0 Mini or 2.5 when Get Options lists them for you; a real person in a model that needs a face check passes it first (**Start Face Check** gives the page they open on their phone). The price follows the length, and it takes about 5 minutes per minute of song. **Outro** ends it on a card after the last shot, the song playing on under it (free): **Outro Card** is Designed by the Director, or the **Release Card** the artist's lyric videos end on, in their lyric style's colours and type.

The artist kit holds their outfits and the workspace's places and props, each with an @handle: **Add Kit Piece** takes an image from a binary property, a link or a stock photo (Search Stock), with an optional **Crop** rectangle (a prop cut out of a bigger photo). Name a piece in **Direction** (`the @blue-set on the @rooftop`) and it is used exactly as it is; the director designs the rest. Words in (parentheses) in the lyrics are backing vocals, sung off camera.

**Draw Place Angles** draws a kit place again from other sides (Three-Quarter, Side, Low): leave **Draw Them** off for the price, then turn it on (with the **Credits** shown) to draw them, about a minute. Each comes back as a new place, `pending` until **Change Kit Piece** with **Keep (A Pending Piece)** keeps it or **Delete Kit Piece** leaves it out. A direction that names places of one set gets them as one set: the director cuts between the angles.

A shot list's pictures: **List Shot List Pictures** shows every picture its shots are made from that is drawn (its places and their angles, the outfits drawn on its people, the props the director designed), each by key (`place:3`, `outfit:1`, `outfit:world`, `person:1`, `prop:2`) with its price and its picture once drawn. **Draw Shot List Pictures** draws them now to see them before the video: leave **Draw Them** off for the price, then turn it on with the **Credits** shown. Those not drawn are drawn with the video, in its quote. Every drawn picture also waits in the artist's kit, `pending`, until **Change Kit Piece** with **Keep (A Pending Piece)** keeps it or **Delete Kit Piece** leaves it out. **Leave Out a Set Angle** writes the next version without one angle.

**Plan Music Video** waits the minute or more the director takes; with **Wait for the Shot List** off it answers at once with the shot list being written, and **Get Music Video Plan Being Written** reads it, its shots as they are written, until its `status` is `ready` (`plan_id`).

The shot list first: **Write Music Video Shot List** takes the same fields and the **Credits** it costs (**List Music Video Drafts**: `price.credits`; a rewrite costs the same, charged once written, nothing if it fails) and returns, in about a minute, the director's concept and its shots (cut between the song's lines) with their lyrics, how each comes in (a cut, or carrying on in a continuous take) and how it is framed (`camera`: size, angle and move). **Shots Meet** is Edited (the shots meet with a cut) or Continuous Takes. Under **Revise**, give a plan id and a note to rewrite it (the next draft). When it's right, quote and create with its **Plan ID**: the video is made from exactly that plan, with no creative direction line in its quote (the shot list was paid for). Turn on **Test the Chorus First** to make only the plan's chorus shots (about 20 seconds) at 480p for a fraction of the price, to check the face, the look and the lip-sync; the quote's `test` says which shots and seconds. Then order the whole video with the same Plan ID. **Outfit From the Kit** dresses the artist in a kit outfit in every shot; leave it empty and the director dresses them. **Only What's in My Kit** keeps the video to what the kit's pictures show (no other place, prop, person or lighting change): on by default once the direction names a kit piece by @handle; choose On or Off to decide yourself. **Performer (Character ID)** lets any character perform instead of the song's artist (List Characters: an artist's or the cast); leave it empty and the artist performs.

After delivery, while `revisable_until` (Get Video) is ahead: **Price Music Video Revision** says what revising each shot costs (`shots[].credits`, the setup paid once as `base_credits`). **Revise Music Video Shot** has the director rewrite a shot from its **Note**, free; add **More Shots**, each with its own note, to change several in one revision (up to 12). Quote and create its plan id with the video's quality: only the shots made again are charged, and the revision is a new video. A delivered music video's `shots[].frame_url` is a picture of each shot as it came out, and `music_video.review` is the director's notes: each shot that needs a fix or could be better, with `finding`, `at_seconds` and a ready revision `note` to pass to **Revise Music Video Shot** (an empty list: every shot passed).

Uploading and making videos need an active plan: without one, those operations fail with `plan_required` (choose a plan in the app). They also need room in the plan's storage (Get Account: `storage`): `storage_full` means delete videos or archive songs you no longer need, or move up a plan. Creating a video spends credits. Quote it first: the quote is the exact number of credits, and creating with that quote id charges only when the video is delivered. To continue a workflow when a video is ready, set its callback URL to an n8n Webhook node; deliveries are signed with the `Kinetune-Signature` header.

## Changelog

### 6.0.4

Source formatted with the n8n starter's Prettier config (no change in behaviour).

### 6.0.3

Built for ES2019, as n8n's starter (no change in behaviour).

### 6.0.2

The icon is the full yellow K tile, without its border.

### 6.0.1

The credential test is declared as n8n's starter does it (no change in behaviour).

### 6.0.0

Operations are grouped by **Resource** (node version 2; version 1 workflows keep the flat Operation list). Breaking: a lyric video is made from its song's draft, changed with Lyric Style, Visual and Picture. Saved lyric video designs are gone, with the fields and operations that used them: Look ID, Clip Looks, List Looks, Get Look, Get Look Clips, Rename Look, Delete Look, Set Look Visibility and Save as Look. A music video's Outro Look ID became **Outro Card**, and Headline's default value is now `default`. Music video concepts (Save, List, Get and Delete Music Video Look) stay. Saved workflows that used the removed fields need those steps set again.

## More from Kinetune

- [Docs for this node](https://kinetune.com/developers/n8n?utm_source=github&utm_medium=readme&utm_campaign=n8n), the [REST API](https://kinetune.com/developers/rest?utm_source=github&utm_medium=readme&utm_campaign=n8n) and [pricing](https://kinetune.com/pricing?utm_source=github&utm_medium=readme&utm_campaign=n8n)
- [kinetune/cli](https://github.com/kinetune/cli): the same operations from the terminal
- [kinetune/skills](https://github.com/kinetune/skills): the Kinetune skill for Claude Code, Codex and Cursor, and the MCP server
- The Kinetune app on the [web](https://kinetune.com/?utm_source=github&utm_medium=readme&utm_campaign=n8n), [iPhone](https://apps.apple.com/app/id6821154371) and [Android](https://play.google.com/store/apps/details?id=com.kinetune.app)
- Questions or bugs: [open an issue](https://github.com/kinetune/n8n-nodes-kinetune/issues) or write to support@kinetune.com

## License

MIT
