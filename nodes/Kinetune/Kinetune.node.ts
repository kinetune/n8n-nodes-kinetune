import type {
  IExecuteFunctions,ILoadOptionsFunctions,INodeExecutionData,INodeListSearchResult,INodeType,INodeTypeDescription,INodePropertyOptions,IHttpRequestOptions,INodeProperties,IDataObject,
} from "n8n-workflow";
import {NodeApiError,NodeConnectionTypes,NodeOperationError} from "n8n-workflow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API JSON is open-ended
type Json=Record<string,any>;
type Context=IExecuteFunctions|ILoadOptionsFunctions;

async function baseUrl(ctx:Context){
  const credentials=await ctx.getCredentials("kinetuneApi");
  return String(credentials.baseUrl||"").replace(/\/$/,"");
}

async function api(this:Context,method:string,path:string,body?:unknown){
  const options:IHttpRequestOptions={method:method as IHttpRequestOptions["method"],url:await baseUrl(this)+path,json:true};
  if(body!==undefined)options.body=body as IDataObject;
  try{return await this.helpers.httpRequestWithAuthentication.call(this,"kinetuneApi",options);}
  catch(error){throw new NodeApiError(this.getNode(),error as Json);}
}

// The artist and song pickers ("From List"): the API's search (q) one page at a time, the offset as the pagination token.
const PICKER_PAGE=50;
async function searchPage(ctx:ILoadOptionsFunctions,path:string,filter:string|undefined,token:unknown,extra:Record<string,string>={}){
  const offset=Math.max(0,Math.trunc(Number(token)||0));
  const query=new URLSearchParams({...extra,limit:String(PICKER_PAGE)});
  const q=String(filter||"").trim().slice(0,100);
  if(q)query.set("q",q);
  if(offset)query.set("offset",String(offset));
  const page=await api.call(ctx,"GET",path+"?"+query.toString()) as {items?:Json[]};
  const items=Array.isArray(page?.items)?page.items:[];
  return {items,paginationToken:items.length>=PICKER_PAGE?offset+items.length:undefined};
}
async function searchArtists(this:ILoadOptionsFunctions,filter?:string,paginationToken?:string):Promise<INodeListSearchResult>{
  const {items,paginationToken:next}=await searchPage(this,"/api/v1/artists",filter,paginationToken);
  return {results:items.map(a=>({name:String(a.name),value:String(a.id)})),paginationToken:next};
}
// Songs as "Title — Artist", with the analysis status while it isn't ready; the link opens the song in the app.
async function songResults(ctx:ILoadOptionsFunctions,filter:string|undefined,paginationToken:unknown,extra:Record<string,string>={}):Promise<INodeListSearchResult>{
  const [{items,paginationToken:next},base]=await Promise.all([searchPage(ctx,"/api/v1/songs",filter,paginationToken,extra),baseUrl(ctx)]);
  return {results:items.map(s=>{
    const status=String(s.analysis?.status||"");
    return {name:String(s.title)+(s.artist_name?" — "+String(s.artist_name):"")+(status&&status!=="ready"?" ("+status+")":""),value:String(s.id),
      ...(s.organization_id?{url:base+"/app/"+encodeURIComponent(String(s.organization_id))+"/songs/"+encodeURIComponent(String(s.id))}:{})};
  }),paginationToken:next};
}
async function searchSongs(this:ILoadOptionsFunctions,filter?:string,paginationToken?:string){return songResults(this,filter,paginationToken);}
// Only analyzed songs can be quoted and rendered.
async function searchReadySongs(this:ILoadOptionsFunctions,filter?:string,paginationToken?:string){return songResults(this,filter,paginationToken,{status:"ready"});}

// A searchable picker ("From List") or a pasted id ("By ID"); execute() reads either with extractValue.
const locator=(displayName:string,name:string,searchListMethod:string,what:string,extra:Json={}):INodeProperties=>({
  displayName,name,type:"resourceLocator",default:{mode:"list",value:""},...extra,
  modes:[
    {displayName:"From List",name:"list",type:"list",placeholder:"Select "+what+"...",typeOptions:{searchListMethod,searchable:true}},
    {displayName:"By ID",name:"id",type:"string",placeholder:"The "+what.replace(/^an? /,"")+" id"},
  ],
} as INodeProperties);

export const CATEGORIES=[
  ["Release","release"],["Fall","fall"],["Halloween","halloween"],["Christmas","christmas"],["Summer","summer"],["Valentine's","valentines"],
  ["Mood","mood"],["Retro","retro"],["Synthwave","synthwave"],["Street","street"],["Nature","nature"],["Luxury","luxury"],
  ["Abstract","abstract"],["Minimal","minimal"],["Neon","neon"],["Pop art","pop-art"],["Lo-fi","lo-fi"],["Grunge","grunge"],
  ["Cosmic","cosmic"],["Cyber","cyber"],["Dreamy","dreamy"],
].map(([name,value])=>({name,value}));

// How a lyric video presents and animates the lyrics (the API's look.lyric_style; GET /options lists them).
export const LYRIC_STYLES=[
  ["Showcase","showcase","The release is the hero: cover, title and artist, with a karaoke line under them"],
  ["Block Stack","block-stack","Words build into a bold justified block; short words grow huge"],
  ["Punch","punch","One huge word at a time, hitting on the beat, with the line underneath"],
  ["Depth Scatter","depth-scatter","Words float in at different depths and sharpen into focus"],
  ["Neon","neon","Glowing tube-light lyrics with a spectrum glowing below"],
  ["Terminal","terminal","Lyrics typed out line by line on a glowing screen, with a cursor"],
  ["Cinematic","cinematic","Elegant titles that breathe in and out of focus between cinema bars"],
  ["Player","player","A music-app lyric sheet that scrolls with the song, with cover and progress bar"],
  ["Lo-fi","lo-fi","Soft words drifting up over grain and dust, with a quiet progress bar"],
  ["Zine","zine","Raw stacked type with grit, RGB hits and scratches"],
  ["Glitch","glitch","Digital lyrics that tear, split and flicker with the beat"],
  ["Pop Art","pop-art","Chunky words that bounce in with hard shadows and highlighter boxes"],
  ["Dreamy","dreamy","A soft lyric sheet that drifts through haze and light leaks"],
  ["Chrome","chrome","Polished metal lyrics that flip into place"],
  ["Visualizer","visualizer","The cover inside a circular spectrum, lyrics beneath it"],
  ["Minimal","minimal","Clean centred lines; the sung word lights up"],
  ["Outline","outline","Hollow letters that fill in as each word is sung"],
  ["Messages","messages","Each line arrives as a chat message, typed as it is sung"],
  ["Vinyl","vinyl","Your cover spinning on a 3D turntable, the lyrics beside it"],
  ["Album","album","Your cover floating in 3D over its reflection, lyrics beneath"],
  ["Retro TV","tv","A 3D CRT television typing your lyrics on its glowing screen"],
  ["Cube","cube","Each line printed on a face of a 3D cube that turns with the song"],
  ["Boombox","cassette","A 3D boombox whose display scrolls your lyrics while the tape turns"],
  ["Phone","phone","Your lyrics arriving as messages on a 3D phone"],
  ["Glass","glass","Iridescent glass shapes drifting over your lyrics and bending them"],
  ["Embers","embers","Lines burn in from glowing edges and burn away to ash"],
  ["Ink","ink","Words bleed in like ink in water, then wash away"],
  ["Smoke","smoke","Lyrics form out of smoke and drift away"],
  ["Stardust","stardust","Each line swarms together out of glowing particles and blows away"],
  ["Drip","drip","Chromatic letters that smear and drip down, splitting on the beat"],
  ["Rainy Window","rain","Lyrics behind a window streaked with rain"],
  ["On Screen","screen","Your lyrics typed on a screen inside the scene: a phone, a monitor, a billboard"],
  ["Behind","behind","Giant words stacked behind the singer or subject of your clips, who stands in front of them"],
  ["Big Type","big-type","Giant gradient words stacking up, with a spectrum along the floor"],
  ["Chant", "chant", "The word stacked three times in glowing italic caps"],
  ["Doodle", "doodle", "Huge words; the key ones in red with hand-drawn stars and bolts"],
  ["Highlight", "highlight", "The sung word on a coloured block, the word before it above"],
  ["Smear", "smear", "Key words smear in from above, off to one side"],
  ["Twin", "twin", "Bold caps pushing each other up; a held key word grows with the last word laid small on top"],
  ["Marquee", "marquee", "Heavy caps with a reflection; held words fill the frame in scrolling rows"],
  ["Gilded", "gilded", "Italic serif typing in; key words in a warm gradient over their reflection"],
  ["Sparkle", "sparkle", "Big caps springing in and growing; key words burst into hand-drawn stickers"],
  ["Flare", "flare", "Bold caps over a streak of light that flares on the beat"],
  ["Circuit", "circuit", "Neon condensed caps that flicker on like a sign"],
  ["Spark", "spark", "The line in bold caps; the sung word glows"],
  ["Loose", "loose", "The line spread across loose rows, plain and lowercase"],
  ["Slab", "slab", "The line packed into a solid block of heavy caps, each word stretched to fill its row"],
  ["Stamp", "stamp", "One heavy word at a time, every word stretched to the same width"],
  ["Whisper", "whisper", "Neighbouring words layered: one huge in cyan, the other whispered on top in italics"],
  ["Tiles", "tiles", "A phrase stacked four times down the frame, folding into a ladder; then wide single words"],
  ["Nested", "nested", "Slanted heavy caps; red key words rise in with scattered copies of themselves"],
  ["Pair", "pair", "Small blackletter words around a wide key word that types in as it is sung"],
  ["Tall", "tall", "One white word at a time with a streak behind it; a tall red word under a line"],
  ["Baton", "baton", "One line at a time rolling up over dimmed footage, cyan and white in turn"],
  ["Mixtape", "mixtape", "Big stencil caps; key words in rounded cyan that flicker through typefaces"],
  ["Trail", "trail", "Small caps that slide in leaving a trail"],
  ["Caption", "caption", "A quiet italic line that fills in as it is sung"],
  ["Focus", "focus", "Striped neon key words turning slowly; long lines tilt in 3D and stretch tall"],
  ["Hush", "hush", "Quiet bold caps in warm white, one word at a time"],
  ["Dusk", "dusk", "One light lowercase word at a time, in a warm tint"],
  ["Murmur", "murmur", "Two italic serif words drifting softly"],
  ["Steel", "steel", "Condensed caps in brushed metal"],
  ["Sway", "sway", "The line in bold caps; the sung word lights up"],
].map(([name,value,description])=>({name,value,description}));

// Browsing a Stock collection (composition clips-editor.ts, held equal by the parity test): its shape, energy and sort filters.
export const BROWSE_SHAPES=[{name:"Both",value:"both"},{name:"Tall",value:"tall"},{name:"Wide",value:"wide"}];
export const BROWSE_ENERGIES=[{name:"All",value:"all"},{name:"Calm",value:"calm"},{name:"Medium",value:"medium"},{name:"Bold",value:"bold"}];
export const BROWSE_SORTS=[{name:"Best First",value:"best",description:"Liveliest first"},{name:"Newest",value:"newest"},{name:"Length",value:"length",description:"Longest first"}];
// A clips picture (composition clips.ts, held equal by the parity test): how the transitions are chosen, the colour grades and the speeds.
export const CLIP_TRANSITION_STYLES=[
  ["Auto","auto","Kinetune picks for each cut"],["Impact","impact","Slams, punches and flashes"],["Flash","flash","Flashes, flares and light leaks"],
  ["Smooth","smooth","Dissolves, ink and whips"],["None","none","Plain cuts only"],
].map(([name,value,description])=>({name,value,description}));
export const CLIP_GRADES=[
  ["Clean","clean"],["Vivid","vivid"],["Punch","punch"],["Warm","warm"],["Cool","cool"],["Golden hour","golden"],["Blue hour","blue"],["Tangerine","tangerine"],
  ["Teal & orange","teal"],["Faded film","faded"],["Matte","matte"],["Silver","silver"],["Deep blacks","deep"],["Glow","glow"],["VHS","vhs"],["Super 8","super8"],
  ["Halation","halation"],["Bleach bypass","bleach"],["Dream","dream"],["Duotone","duotone"],["Cross process","cross"],["Noir","noir"],["Poster","poster"],
  ["Night vision","night"],["Infrared","infrared"],["CCTV","cctv"],["Thermal","thermal"],
].map(([name,value])=>({name,value}));
export const CLIP_SPEEDS=[0.5,0.75,1,1.5,2];
// Effects over a picture (composition effects.ts, held equal by the parity test): up to three, each with a strength 0–1.
/** Generate's Style (as @kinetune/video-types GENERATE_STYLES names them; checked by a test). */
export const GENERATE_STYLES=[{name:"Calm",value:"calm"},{name:"Cinematic",value:"cinematic"},{name:"Dreamy",value:"dreamy"},{name:"Intense",value:"intense"}];
export const EFFECTS=[
  ["Light leak","light-leak","Light"],["God rays","god-rays","Light"],["Glow","glow","Light"],["Vignette","vignette","Light"],
  ["Film burn","film-burn","Film"],["Film grain","film-grain","Film"],["Old footage","old-footage","Film"],
  ["Shake","shake","Camera"],["Mirror","mirror","Camera"],["Blur in/out","blur","Camera"],
  ["VHS","vhs","Digital"],["Glitch","glitch","Digital"],["RGB split","rgb-split","Digital"],
].map(([name,value,description])=>({name,value,description}));
const effectsField=(name:string,description:string,extra:Record<string,unknown>={}):INodeProperties=>({displayName:"Effects",name,type:"fixedCollection",typeOptions:{multipleValues:true},default:{},
  placeholder:"Add Effect",description,options:[{name:"effect",displayName:"Effect",values:[
    {displayName:"Effect",name:"id",type:"options",options:EFFECTS,default:"light-leak"},
    {displayName:"Strength",name:"amount",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:2},default:0.6,description:"0 to 1"},
  ]}],...extra} as INodeProperties);
/** A fixedCollection of effects as the API takes them (at most three, each once: the API says which when not). */
function effectsOf(ctx:IExecuteFunctions,name:string,index:number){
  const list=(ctx.getNodeParameter(name,index,{}) as {effect?:Array<{id:string;amount:number}>}).effect??[];
  if(list.length>3)throw new NodeOperationError(ctx.getNode(),"Up to three effects",{itemIndex:index});
  return list.map(e=>({id:String(e.id),amount:Number(e.amount??0.6)}));
}

// A resource locator's id (From List or By ID), or a plain string parameter; empty when unset.
const locatorValue=(ctx:IExecuteFunctions,name:string,index:number)=>String(ctx.getNodeParameter(name,index,"",{extractValue:true})??"").trim();

// Sizes are entered as percentages of the Look's design and sent as multipliers (100% = omitted).
const scaleField=(key:string,percent:number)=>percent&&percent!==100?{[key]:Math.round(percent)/100}:{};

// Same request as the app's Canvas mode: a picture (clips, the cover, a visualizer, or generated with AI), how it loops, how
// long (3–8 s), and an optional light and atmosphere over it.
export const CANVAS_ATMOSPHERES=["none","snow","leaves","petals","embers","sparkles","rain","confetti","hearts","dust"];
function canvasPicture(ctx:IExecuteFunctions,index:number){
  const text=(name:string)=>String(ctx.getNodeParameter(name,index,"")||"").trim();
  const kind=String(ctx.getNodeParameter("canvasPicture",index,"clips"));
  if(kind==="cover")return {kind,motion:String(ctx.getNodeParameter("canvasMotion",index,"push"))};
  if(kind==="visualizer"){const preset=text("canvasVisual");return {kind,...(preset?{preset}:{})};}
  if(kind==="generate"){
    const prompt=text("canvasPrompt"),who=String(ctx.getNodeParameter("canvasWith",index,"none")),video=String(ctx.getNodeParameter("canvasVideo",index,"standard"));
    const character=who==="character"?text("canvasCharacterId"):"";
    if(who==="character"&&!character)throw new NodeOperationError(ctx.getNode(),"Pick the cast character (List Characters)",{itemIndex:index});
    return {kind,...(prompt?{prompt}:{}),from:String(ctx.getNodeParameter("canvasFrom",index,"song")),with:character||who,video:video==="still"?null:video};
  }
  const moods=commaList(ctx.getNodeParameter("canvasMoods",index,"")),folders=commaList(ctx.getNodeParameter("canvasFolders",index,""));
  const stockIds=commaList(ctx.getNodeParameter("canvasStockIds",index,""));
  const fill=String(ctx.getNodeParameter("canvasFill",index,"blur")),colour=text("canvasFillColour");
  if(fill==="colour"&&!/^#[0-9a-fA-F]{6}$/.test(colour))throw new NodeOperationError(ctx.getNode(),"Fill Colour is a colour like #1a1a1a",{itemIndex:index});
  const num=(name:string,fallback:number)=>{const v=Number(ctx.getNodeParameter(name,index,fallback));return Number.isFinite(v)?v:fallback;};
  return {kind:"clips",...(moods.length||folders.length?{sources:{moods,folders}}:{}),...(stockIds.length?{stock_ids:stockIds}:{}),
    grade:String(ctx.getNodeParameter("canvasGrade",index,"clean")),grade_amount:num("canvasGradeAmount",1),fill,...(fill==="colour"?{fill_colour:colour}:{}),
    speed:Number(ctx.getNodeParameter("canvasSpeed",index,1)),cut:String(ctx.getNodeParameter("canvasCut",index,"hard")),
    crossfade:num("canvasCrossfade",.75),camera:String(ctx.getNodeParameter("canvasCamera",index,"still")),fade:Boolean(ctx.getNodeParameter("canvasFade",index,false)),
    framing:{x:num("canvasFramingX",0),y:num("canvasFramingY",0),zoom:num("canvasZoom",1)},rotate:num("canvasRotate",0),steady:Boolean(ctx.getNodeParameter("canvasSteady",index,false))};
}
function canvasRequest(ctx:IExecuteFunctions,index:number){
  const picture=canvasPicture(ctx,index);
  const light=String(ctx.getNodeParameter("canvasLight",index,"")||"").trim();
  const seed=picture.kind==="clips"?Math.trunc(Number(ctx.getNodeParameter("canvasSeed",index,0)||0)):0;
  return {
    type:"canvas",song_id:locatorValue(ctx,"songId",index),picture,
    variations:picture.kind==="clips"?Number(ctx.getNodeParameter("canvasVariations",index,1)||1):1,
    loop:String(ctx.getNodeParameter("canvasLoop",index,"drift")),seconds:Math.round(Number(ctx.getNodeParameter("canvasSeconds",index,8)||8)*10)/10,
    ...(light?{light:{preset:light}}:{}),atmosphere:String(ctx.getNodeParameter("canvasAtmosphere",index,"none")),
    effects:effectsOf(ctx,"canvasEffects",index),
    ...(seed>0?{edit:{seed}}:{}),
  };
}

// Same brief as the app, for a plan and a music video: the model, category, style (omitted, the director picks), one
// format, the whole song or a section of it, direction, who performs (omitted, the song's artist) and the kit outfit worn throughout
// (omitted, the director picks).
// The brief fields the node always has a value for, at their defaults (the API's own).
const BRIEF_DEFAULTS:Record<string,unknown>={model:"one-take",category:"performance",aspect_ratio:"9:16"};
function musicVideoBrief(ctx:IExecuteFunctions,index:number){
  const text=(name:string)=>String(ctx.getNodeParameter(name,index,"")||"").trim();
  const direction=text("musicDirection"),style=text("musicStyle"),outfitKit=text("musicOutfitKit").replace(/^@/,""),onScreen=text("musicOnScreen"),performer=text("musicPerformer");
  const section=String(ctx.getNodeParameter("musicLength",index,"whole"))==="section";
  return {
    model:String(ctx.getNodeParameter("musicModel",index,BRIEF_DEFAULTS.model)),category:String(ctx.getNodeParameter("musicCategory",index,BRIEF_DEFAULTS.category)),aspect_ratio:String(ctx.getNodeParameter("musicAspectRatio",index,BRIEF_DEFAULTS.aspect_ratio)),
    ...(style?{style}:{}),...(direction?{direction}:{}),
    ...(section?{trim:{start_seconds:Number(ctx.getNodeParameter("musicStart",index,0)||0),end_seconds:Number(ctx.getNodeParameter("musicEnd",index,0)||0)}}:{}),
    ...(onScreen?{on_screen:onScreen}:{}),
    ...(performer?{performer}:{}),
    ...(outfitKit?{cast:{outfit_kit:outfitKit}}:{}),
    // The people in it besides the performer, each by handle with what they do (optional: the director casts the rest).
    ...(()=>{const people=((ctx.getNodeParameter("musicPeople",index,{}) as {person?:Array<{character:string;does?:string;outfit?:string}>}).person??[])
      .map(p=>({character:String(p.character||"").trim().replace(/^@/,""),does:String(p.does||"").trim(),outfit:String(p.outfit||"").trim().replace(/^@/,"")})).filter(p=>p.character)
      .map(p=>({character:p.character,...(p.does?{does:p.does}:{}),...(p.outfit?{outfit:p.outfit}:{})}));
      return people.length?{people}:{};})(),
    // The places the brief leaves open: invented (the API's default, not sent) or real ones the director finds.
    ...(String(ctx.getNodeParameter("musicScenes",index,"invent"))==="stock"?{scenes:{mode:"stock"}}:{}),
    // How the shots meet: cuts (the API's default, not sent) or continuous takes.
    ...(String(ctx.getNodeParameter("musicTakes",index,"cuts"))==="continuous"?{takes:"continuous"}:{}),
    // Lip-sync: the director decides (the API's default, not sent) or never.
    ...(String(ctx.getNodeParameter("musicLipsync",index,"auto"))==="never"?{lipsync:"never"}:{}),
    // Only what's in the kit: on or off when chosen, else the API's default (on when the direction names a kit piece).
    ...(()=>{const only=String(ctx.getNodeParameter("musicKitOnly",index,"")||"");return only==="on"?{kit_only:true}:only==="off"?{kit_only:false}:{};})(),
    ...(String(ctx.getNodeParameter("musicLookId",index,"")||"").trim()?{look_id:String(ctx.getNodeParameter("musicLookId",index,"")).trim()}:{}),
    // Who else: the director may cast (the API's default, not sent) or only who was picked.
    ...(String(ctx.getNodeParameter("musicCastMode",index,"")||"")==="exact"?{cast_mode:"exact"}:{}),
  };
}
// A music video from a plan (Plan ID: its brief replaces the fields) or from the brief. A test of the plan is one video, made at 480p
// with no outro, so the outro is left out of it.
function musicVideoRequest(ctx:IExecuteFunctions,index:number){
  const planId=String(ctx.getNodeParameter("musicPlanId",index,"")||"").trim();
  const refinishId=String(ctx.getNodeParameter("musicRefinishId",index,"")||"").trim();
  const test=Boolean(planId&&!refinishId&&ctx.getNodeParameter("musicTest",index,false));
  const outro=test?[]:ctx.getNodeParameter("musicOutro",index,[]) as string[];
  const outroLook=(ctx.getNodeParameter("musicOutroLookId",index,"") as string).trim();
  return {type:"music-video",variations:Number(ctx.getNodeParameter("musicVariations",index,1)||1),song_id:locatorValue(ctx,"songId",index),
    ...(()=>{const quality=String(ctx.getNodeParameter("musicQuality",index,"")||"");return quality?{quality}:{};})(),
    ...(refinishId?{refinish:{video_id:refinishId}}:planId?{plan_id:planId,...(test?{test:true}:{})}:{...musicVideoBrief(ctx,index),
      ...(()=>{const casting=String(ctx.getNodeParameter("musicCastingId",index,"")||"").trim();return casting?{casting_id:casting}:{};})()}),
    ...(outro.length?{outro:{display:{title:outro.includes("title"),artist:outro.includes("artist"),cover:outro.includes("cover"),badges:outro.includes("badges")},...(outroLook?{look_id:outroLook}:{})}}:{})};
}
// A plan for the brief, or a rewrite of an earlier plan of the song with a note (Revise).
function musicVideoPlanRequest(ctx:IExecuteFunctions,index:number){
  const revise=ctx.getNodeParameter("musicRevise",index,{}) as {planId?:string;note?:string};
  const planId=String(revise.planId||"").trim(),note=String(revise.note||"").trim();
  if(Boolean(planId)!==Boolean(note))throw new NodeOperationError(ctx.getNode(),"Revise needs both the plan id and a note",{itemIndex:index});
  // A rewrite keeps the plan's brief: the fields left at their defaults aren't sent, so only those set here replace the plan's.
  const brief:Record<string,unknown>=musicVideoBrief(ctx,index);
  const sent=planId?Object.fromEntries(Object.entries(brief).filter(([key,value])=>BRIEF_DEFAULTS[key]!==value)):brief;
  // Off: answers at once with the shot list being written (Get Music Video Plan Being Written reads it until it is ready).
  const wait=ctx.getNodeParameter("musicWait",index,true)!==false;
  return {song_id:locatorValue(ctx,"songId",index),...sent,credits:Number(ctx.getNodeParameter("musicPlanCredits",index,0)),...(planId?{revise:{plan_id:planId,note}}:{}),...(wait?{}:{wait:false})};
}

// A kit piece from a binary property, a link or a stock photo, with the rectangle kept of it.
const cropOf=(value:{x?:number;y?:number;w?:number;h?:number})=>value.x!==undefined||value.y!==undefined||value.w!==undefined||value.h!==undefined
  ?{crop:{x:value.x??0,y:value.y??0,w:value.w??1,h:value.h??1}}:{};
function kitPieceFields(ctx:IExecuteFunctions,index:number){
  const text=(name:string)=>String(ctx.getNodeParameter(name,index,"")||"").trim();
  const kind=String(ctx.getNodeParameter("kitKind",index,"prop")),artistId=locatorValue(ctx,"kitArtistId",index);
  if(kind==="outfit"&&!artistId)throw new NodeOperationError(ctx.getNode(),"An outfit needs its artist",{itemIndex:index});
  const handle=text("kitHandle"),description=text("kitDescription");
  // An outfit is its artist's; a place or prop goes in the artist's kit given (empty: the workspace's only artist, else its first, shared).
  return {kind,name:text("kitName"),...(artistId?kind==="outfit"?{artist_id:artistId}:{owner_artist_id:artistId}:{}),...(handle?{handle}:{}),...(description?{description}:{}),
    ...(ctx.getNodeParameter("kitShared",index,false)?{shared:true}:{}),...cropOf(ctx.getNodeParameter("kitCrop",index,{}) as Json)};
}

const commaList=(value:unknown)=>String(value||"").split(",").map(v=>v.trim()).filter(Boolean);
// The Look's parts changed (a lyric video's look, Save as Look): lyric style, visual and picture; each left out keeps the Look's own.
function lookChanges(ctx:IExecuteFunctions,index:number){
  const lyricStyle=String(ctx.getNodeParameter("lyricStyle",index,"")||"");
  const behind=String(ctx.getNodeParameter("behind",index,"")||"");
  const visual=String(ctx.getNodeParameter("visual",index,"")||"").trim();
  const picture=String(ctx.getNodeParameter("picture",index,"")||"");
  let background:Json|undefined;
  if(picture==="visualizer")background={kind:"visualizer"};
  else if(picture==="clips"){
    const moods=commaList(ctx.getNodeParameter("clipMoods",index,"")),folders=commaList(ctx.getNodeParameter("clipFolders",index,"")),looks=commaList(ctx.getNodeParameter("clipLooks",index,""));
    if(!moods.length&&!folders.length&&!looks.length)throw new NodeOperationError(ctx.getNode(),"Clips need at least one mood, folder or Look",{itemIndex:index});
    background={kind:"clips",sources:{...(moods.length?{moods}:{}),...(folders.length?{folders}:{}),...(looks.length?{looks}:{})},
      density:String(ctx.getNodeParameter("cutDensity",index,"even")),
      transitions:{style:String(ctx.getNodeParameter("transitionStyle",index,"auto")),amount:Number(ctx.getNodeParameter("transitionAmount",index,0.5)),feel:Number(ctx.getNodeParameter("transitionFeel",index,0.5))},
      grade:String(ctx.getNodeParameter("clipGrade",index,"clean")),grade_amount:Number(ctx.getNodeParameter("clipGradeAmount",index,1)),
      effects:effectsOf(ctx,"clipEffects",index),shape:String(ctx.getNodeParameter("clipShape",index,"both")),
      fill:String(ctx.getNodeParameter("clipFill",index,"blur")),speed:Number(ctx.getNodeParameter("clipSpeed",index,1))};
  }
  return {...(lyricStyle?{lyric_style:lyricStyle}:{}),...(behind?{behind:behind==="on"}:{}),...(visual?{visual:{preset:visual}}:{}),...(background?{background}:{})};
}

// Same request as the app: song, Look (a saved one or Kinetune's pick, with any part changed), formats, display switches and trim.
function generationRequest(ctx:IExecuteFunctions,index:number){
  const videoType=String(ctx.getNodeParameter("videoType",index,"lyric-video"));
  if(videoType==="canvas")return canvasRequest(ctx,index);
  if(videoType==="music-video")return musicVideoRequest(ctx,index);
  const lookId=String(ctx.getNodeParameter("lookId",index,"")||"").trim();
  const look={...(lookId?{id:lookId}:{}),...lookChanges(ctx,index)};
  const clipsPicture=String(ctx.getNodeParameter("picture",index,"")||"")==="clips";
  const trimStart=Number(ctx.getNodeParameter("trimStart",index,0)||0),trimEnd=Number(ctx.getNodeParameter("trimEnd",index,0)||0);
  const headline=String(ctx.getNodeParameter("headline",index,"look"));
  const titleCard=String(ctx.getNodeParameter("titleCard",index,"auto"));
  const ratios=ctx.getNodeParameter("aspectRatios",index,["9:16"]) as string[];
  // Clips: which clips land where (0: the first); each further variation draws other clips.
  const seed=clipsPicture?Math.trunc(Number(ctx.getNodeParameter("clipSeed",index,0)||0)):0;
  return {
    type:"lyric-video",
    variations:clipsPicture?Number(ctx.getNodeParameter("variations",index,1)||1):1,
    song_id:locatorValue(ctx,"songId",index),look,
    aspect_ratios:ratios.length?ratios:["9:16"],
    display:{
      title:Boolean(ctx.getNodeParameter("showTitle",index,true)),artist:Boolean(ctx.getNodeParameter("showArtist",index,true)),
      cover:Boolean(ctx.getNodeParameter("showCover",index,true)),lyrics:Boolean(ctx.getNodeParameter("showLyrics",index,true)),
      badges:Boolean(ctx.getNodeParameter("showBadges",index,true)),...(headline!=="look"?{headline}:{}),...(titleCard!=="auto"?{title_card:titleCard}:{}),
      ...scaleField("cover_scale",Number(ctx.getNodeParameter("coverSize",index,100))),...scaleField("text_scale",Number(ctx.getNodeParameter("textSize",index,100))),
      ...scaleField("artist_scale",Number(ctx.getNodeParameter("artistSize",index,100))),
      ...scaleField("spacing_scale",Number(ctx.getNodeParameter("spacing",index,100))),
    },
    ...(trimEnd>0?{trim:{start_seconds:trimStart,end_seconds:trimEnd}}:{}),
    ...(seed>0?{edit:{seed}}:{}),
  };
}

// One shot and its note, as before; with More Shots, every shot with its own note in one revision (shots).
function revisionRequest(ctx:IExecuteFunctions,index:number){
  const first={shot:Number(ctx.getNodeParameter("revisedShot",index,1)),note:String(ctx.getNodeParameter("revisionNote",index,"")).trim()};
  const more=((ctx.getNodeParameter("moreRevisedShots",index,{}) as {shot?:Array<{shot:number;note?:string}>}).shot??[])
    .map(s=>({shot:Number(s.shot),note:String(s.note??"").trim()}));
  if(!more.length)return first;
  const shots=[first,...more];
  const fail=(message:string)=>{throw new NodeOperationError(ctx.getNode(),message,{itemIndex:index});};
  if(shots.some(s=>!s.note))fail("Every shot to revise needs a note");
  if(new Set(shots.map(s=>s.shot)).size!==shots.length)fail("Each shot can be revised once per revision");
  if(shots.length>12)fail("Up to 12 shots in one revision");
  return {shots};
}

// Every node operation and the API registry operations it performs (checked against @kinetune/api-spec by a test).
export const OPERATION_IDS:Record<string,string[]>={
  quote:["quotes.lyric_video","quotes.canvas","quotes.music_video"],create:["videos.create_lyric_video","videos.create_canvas","videos.create_music_video"],get:["videos.get"],listVideos:["videos.list"],
  planMusicVideo:["music_video_plans.create"],getMusicVideoPlan:["music_video_plans.get"],getMusicVideoPlanWrite:["music_video_plans.write"],listMusicVideoFrames:["music_video_plans.frames"],drawMusicVideoFrame:["music_video_plans.draw_frame"],getMusicVideoStoryboard:["music_video_plans.storyboard"],deleteMusicVideoPlan:["music_video_plans.delete"],listMusicVideoDrafts:["music_video_plans.list"],saveMusicVideoLook:["videos.save_look"],listMusicVideoLooks:["music_video_looks.list"],getMusicVideoLook:["music_video_looks.get"],deleteMusicVideoLook:["music_video_looks.archive"],reviseMusicVideoShot:["videos.revise_shot"],priceMusicVideoRevision:["videos.revision_prices"],swapMusicVideoPlace:["music_video_plans.swap_place"],checkMusicVideoModel:["music_video_plans.check_model"],switchMusicVideoModel:["music_video_plans.switch_model"],listMusicVideoPictures:["music_video_plans.pictures"],listMusicVideoVersions:["music_video_plans.versions"],deleteMusicVideoVersion:["music_video_plans.delete_version"],drawMusicVideoPictures:["music_video_plans.draw_pictures"],dropMusicVideoAngle:["music_video_plans.drop_angle"],
  cancel:["videos.cancel"],retry:["videos.retry"],deleteVideo:["videos.delete"],listVideoDrafts:["video_drafts.list"],deleteVideoDrafts:["video_drafts.delete"],shareVideo:["videos.share"],unshareVideo:["videos.unshare"],getAccount:["account.get"],createUpload:["uploads.create"],options:["options.get"],listOrganizations:["organizations.list"],createOrganization:["organizations.create"],updateOrganization:["organizations.update"],
  listLooks:["looks.list"],getLook:["looks.get"],getLookClips:["looks.clips"],renameLook:["looks.rename"],deleteLook:["looks.delete"],setVisibility:["looks.visibility"],saveLook:["looks.save"],
  getSongDraft:["songs.draft"],getVideoDraft:["songs.video_draft.get"],editVideoDraft:["songs.video_draft.edit"],listClips:["clips.list"],browseClipMood:["clip_moods.browse"],similarClips:["clips.similar"],clipRebound:["clips.rebound"],clipSteady:["clips.steady"],clipBestSpot:["clips.loop"],generateClips:["clips.generate"],retryClipImport:["clip_imports.retry"],dismissClipImport:["clip_imports.dismiss"],deleteClip:["clips.delete"],moveClips:["clips.move"],analyzeClips:["clips.analyze"],listClipFolders:["clip_folders.list"],createClipFolder:["clip_folders.create"],getClipFolder:["clip_folders.get"],
  renameClipFolder:["clip_folders.rename"],deleteClipFolder:["clip_folders.delete"],importClips:["clip_folders.import"],searchStock:["stock.search"],
  listCanvasPresets:["canvas_presets.list"],saveCanvasPreset:["canvas_presets.save"],renameCanvasPreset:["canvas_presets.rename"],deleteCanvasPreset:["canvas_presets.delete"],
  listArtists:["artists.list"],createArtist:["artists.create"],getArtist:["artists.get"],renameArtist:["artists.update"],archiveArtist:["artists.archive"],
  findArtistInCatalog:["artists.find_in_catalog"],linkArtist:["artists.link"],listReleasedSongs:["songs.list_released"],importSongs:["songs.import"],
  listSongImports:["imports.list"],getSongImport:["imports.get"],addSongImportAudio:["imports.add_audio"],cancelSongImport:["imports.cancel"],
  setArtistImage:["artists.set_image"],removeArtistImage:["artists.remove_image"],
  listArtistProfiles:["artists.profiles.list"],addArtistProfile:["artists.profiles.add"],reorderArtistProfiles:["artists.profiles.reorder"],updateArtistProfile:["artists.profiles.update"],
  removeArtistProfile:["artists.profiles.remove"],discoverArtistProfiles:["artists.profiles.discover"],confirmAllArtistProfiles:["artists.profiles.confirm_all"],
  getArtistPage:["artists.page.get"],updateArtistPage:["artists.page.update"],previewArtistPage:["artists.page.preview"],publishArtistPage:["artists.page.publish"],
  unpublishArtistPage:["artists.page.unpublish"],getArtistPageStats:["artists.page.stats"],claimArtistHandle:["artists.handle.claim"],checkHandle:["handles.check"],
  listSongs:["songs.list"],createSong:["songs.create"],getSong:["songs.get"],renameSong:["songs.update"],setSongCover:["songs.set_cover"],archiveSong:["songs.archive"],
  quoteCovers:["covers.quote"],makeCovers:["covers.make"],getCoverRequest:["covers.get"],redrawCover:["covers.redraw"],listSongCovers:["covers.list"],useCover:["covers.use"],deleteCover:["covers.delete"],
  // A song's files: the download links Get Song returns (cover_art.download_url, audio.download_url), on their own.
  downloadSongCover:["songs.get"],downloadSongAudio:["songs.get"],
  songAnalysis:["songs.analysis"],reanalyzeSong:["songs.reanalyze"],setSongLyrics:["songs.set_lyrics"],clearSongLyrics:["songs.clear_lyrics"],setSongWords:["songs.set_words"],transcribeSong:["songs.transcription_price","songs.transcribe"],
  editSongBrief:["songs.edit_brief"],rewriteSongBrief:["songs.remake_brief"],
  listCharacters:["characters.list"],getFaceCheck:["characters.face_check.get"],startFaceCheck:["characters.face_check.start"],withdrawFaceCheck:["characters.face_check.withdraw"],startCharacter:["character_requests.create"],getCharacterRequest:["character_requests.get"],drawCharacterSheet:["character_requests.draw"],keepCharacter:["character_requests.keep"],discardCharacterRequest:["character_requests.delete"],listCharacterRequests:["character_requests.list"],
  listKit:["kit.list"],addKitPiece:["kit.add"],getKitPiece:["kit.get"],updateKitPiece:["kit.update"],deleteKitPiece:["kit.delete"],drawPlaceAngles:["kit.angles"],
  castMusicVideo:["music_video_castings.create"],getCasting:["music_video_castings.get"],drawCast:["music_video_castings.draw"],deleteCasting:["music_video_castings.delete"],
  suggestIdea:["ideas.suggest"],listIdeas:["ideas.list"],getIdea:["ideas.get"],voteForIdea:["ideas.vote"],removeIdeaVote:["ideas.unvote"],followIdea:["ideas.follow"],unfollowIdea:["ideas.unfollow"],
};

// The Look's parts a lyric video (and Save as Look) can change: lyric style, visual and picture (the Look's own, clips or a visualizer).
const clips={picture:["clips"]};
const lookChangeFields:INodeProperties[]=[
  {displayName:"Lyric Style",name:"lyricStyle",type:"options",options:[{name:"Look's Own",value:"",description:"The Look's own lyric style"},...LYRIC_STYLES],default:"",
    description:"How the lyrics are presented and animated: the Look's design with that style's motion, at no extra cost"},
  {displayName:"Words Behind the Subject",name:"behind",type:"options",options:[{name:"As the Style Has It",value:""},{name:"On",value:"on",description:"Big words go behind the person or figure in the clips"},{name:"Off",value:"off"}],default:"",
    description:"Only lyric styles with big words take it (Get Options marks them behind); others keep their words in front. Free."},
  {displayName:"Visual",name:"visual",type:"string",default:"",placeholder:"liquid/amber-aurora",
    description:"The visual that moves with the music, for the whole song: a key from Get Options (visualizers.presets), or none for no visual. Empty: the Look's own."},
  {displayName:"Picture",name:"picture",type:"options",options:[
    {name:"Look's Own",value:"",description:"The Look's own picture (a Look made before clips plays its picture as clips of its own)"},
    {name:"Clips",value:"clips",description:"Short clips from Stock collections and your folders (My footage), cut on the beat"},
    {name:"Visualizer",value:"visualizer",description:"No picture: the visual fills the frame behind the words"},
  ],default:""},
  {displayName:"Clip Moods",name:"clipMoods",type:"string",default:"",placeholder:"city,golden",
    description: 'Stock collection IDs from Get Options (clip_moods), comma-separated. With Clip Folders, at least one source, and at most as many as your plan allows (Get Account: limits.clip_sources).',displayOptions:{show:clips}},
  {displayName:"Clip Folders",name:"clipFolders",type:"string",default:"",placeholder:"folder_…",
    description: 'Your clip folder IDs (List Clip Folders), comma-separated',displayOptions:{show:clips}},
  {displayName:"Clip Looks",name:"clipLooks",type:"string",default:"",placeholder:"look_…",
    description: 'Look IDs whose own picture plays as clips (a Look made before clips: its background.sources.looks), comma-separated',displayOptions:{show:clips}},
  {displayName:"Cuts",name:"cutDensity",type:"options",options:[{name:"One Clip",value:"one",description:"One clip for the whole video"},{name:"Fewer",value:"fewer",description:"Calm"},{name:"Even",value:"even",description:"The song's own pulse"},{name:"More",value:"more",description:"Busy"}],default:"even",
    description:"How often the clips cut on the beat",displayOptions:{show:clips}},
  {displayName:"Transitions",name:"transitionStyle",type:"options",options:CLIP_TRANSITION_STYLES,default:"auto",description:"How the clips meet",displayOptions:{show:clips}},
  {displayName:"Transition Amount",name:"transitionAmount",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:2},default:0.5,
    description:"How many cuts get a transition, 0 to 1",displayOptions:{show:clips}},
  {displayName:"Transition Feel",name:"transitionFeel",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:2},default:0.5,
    description:"How wild the transitions are, calm (0) to wild (1)",displayOptions:{show:clips}},
  {displayName:"Grade",name:"clipGrade",type:"options",options:CLIP_GRADES,default:"clean",description:"The colour grade over the clips",displayOptions:{show:clips}},
  {displayName:"Grade Strength",name:"clipGradeAmount",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:2},default:1,description:"How strong the grade is, 0 to 1",displayOptions:{show:clips}},
  effectsField("clipEffects","Up to three, over the clips across the song",{displayOptions:{show:clips}}),
  {displayName:"Clip Shape",name:"clipShape",type:"options",options:[{name:"Both",value:"both"},{name:"Tall Only",value:"tall"},{name:"Wide Only",value:"wide"}],default:"both",
    description:"Which clip shapes are used",displayOptions:{show:clips}},
  {displayName:"Wide Clips Fill",name:"clipFill",type:"options",options:[{name:"Cover",value:"cover",description:"Fill the frame, the sides trimmed"},{name:"Blur",value:"blur",description:"A blurred copy behind it"},{name:"Bars",value:"bars",description:"Black bars"}],default:"blur",
    description:"How a clip of the other shape fills the frame",displayOptions:{show:clips}},
  {displayName:"Speed",name:"clipSpeed",type:"options",options:CLIP_SPEEDS.map(v=>({name:v+"×",value:v})),default:1,description:"How fast the clips play",displayOptions:{show:clips}},
];
const lyricFields:INodeProperties[]=[
  {displayName:"Look ID",name:"lookId",type:"string",default:"",placeholder:"look_…",
    description:"A saved Look (List Looks). Empty: Kinetune picks one for the song (Get Song Draft shows which)."},
  ...lookChangeFields,
  {displayName:"Seed",name:"clipSeed",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,
    description: 'Which clips land where; the same seed makes the same video, another one other clips on the same cuts. 0: the first.',displayOptions:{show:clips}},
  {displayName:"Variations",name:"variations",type:"number",typeOptions:{minValue:1,maxValue:4,numberPrecision:0},default:1,
    description:"How many videos to make (1–4), each drawing other clips, charged per video",displayOptions:{show:clips}},
  {displayName:"Formats",name:"aspectRatios",type:"multiOptions",options:[{name:"Vertical 9:16",value:"9:16"},{name:"Wide 16:9",value:"16:9"},{name:"Square 1:1",value:"1:1"}],default:["9:16"]},
  {displayName:"Trim Start (Seconds)",name:"trimStart",type:"number",typeOptions:{minValue:0,numberPrecision:1},default:0,description:"Start of the section to render. Only used when Trim End is set."},
  {displayName:"Trim End (Seconds)",name:"trimEnd",type:"number",typeOptions:{minValue:0,numberPrecision:1},default:0,description:"End of the section (at least 8 seconds after Trim Start). Leave 0 for the whole song."},
  {displayName:"Show Song Title",name:"showTitle",type:"boolean",default:true},
  {displayName:"Show Artist Name",name:"showArtist",type:"boolean",default:true},
  {displayName:"Show Cover Art",name:"showCover",type:"boolean",default:true},
  {displayName:"Show Lyrics",name:"showLyrics",type:"boolean",default:true},
  {displayName:"Show Streaming Badges",name:"showBadges",type:"boolean",default:true},
  {displayName:"Cover Size (%)",name:"coverSize",type:"number",typeOptions:{minValue:75,maxValue:125,numberPrecision:0},default:100,description:"Cover art size relative to the Look's design (75–125). The layout still keeps everything inside the frame."},
  {displayName:"Title & Artist Size (%)",name:"textSize",type:"number",typeOptions:{minValue:85,maxValue:130,numberPrecision:0},default:100,description:"Song title and artist name size relative to the Look's design (85–130). Titles stay within two lines."},
  {displayName:"Artist Name Size (%)",name:"artistSize",type:"number",typeOptions:{minValue:85,maxValue:150,numberPrecision:0},default:100,description:"Artist name size on top of Title & Artist Size (85–150). It never grows past 90% of the title."},
  {displayName:"Spacing (%)",name:"spacing",type:"number",typeOptions:{minValue:75,maxValue:150,numberPrecision:0},default:100,description:"Space between all elements, relative to the Look's design (75–150). The layout still keeps everything inside the frame."},
  {displayName:"Headline",name:"headline",type:"options",options:[{name:"Coming Soon",value:"coming-soon"},{name:"Listen Now",value:"listen-now"},{name:"Look Default",value:"look"},{name:"New Release",value:"new-release"},{name:"None",value:"none"},{name:"Out Now",value:"out-now"}],default:"look"},
  {displayName:"Title Card",name:"titleCard",type:"options",options:[{name:"Default",value:"auto",description:"Start and end over clips, every break otherwise"},{name:"Start and End",value:"ends"},{name:"Every Break",value:"breaks"},{name:"Only the Label",value:"label"}],default:"auto",description: 'When a kinetic lyric style shows its big title card (cover, title, artist) instead of the small label: in the stretches without lyrics at the start and end, also in every break of 3 seconds or more, or never'},
];
const canvasShows=(kinds:string[])=>({displayOptions:{show:{canvasPicture:kinds}}});
const canvasFields:INodeProperties[]=[
  {displayName:"Picture",name:"canvasPicture",type:"options",options:[
    {name:"Clips",value:"clips",description:"Stock moods, your own folders or Pexels videos"},
    {name:"Cover",value:"cover",description:"The song's cover, moving"},
    {name:"Visualizer",value:"visualizer",description:"A calm visual in the cover's colours"},
    {name:"Generate With AI",value:"generate",description:"A picture made for it, from the song or the cover (costs more: quote first)"},
  ],default:"clips",description:"What the Canvas shows"},
  {displayName:"Clip Moods",name:"canvasMoods",type:"string",default:"",placeholder:"euphoria,golden",
    description: 'Stock collection IDs from Get Options (clip_moods), comma-separated. Empty, with no folders: the song\'s own moods.',...canvasShows(["clips"])},
  {displayName:"Clip Folders",name:"canvasFolders",type:"string",default:"",placeholder:"folder_…",description: 'Your clip folder IDs (List Clip Folders), comma-separated',...canvasShows(["clips"])},
  {displayName:"Pexels Video IDs",name:"canvasStockIds",type:"string",default:"",placeholder:"123456",
    description: 'Up to 3 video IDs from Search Stock, comma-separated: brought into your Pexels folder first, then used',...canvasShows(["clips"])},
  {displayName:"Grade",name:"canvasGrade",type:"options",options:CLIP_GRADES,default:"clean",description:"The colour grade over the clips",...canvasShows(["clips"])},
  {displayName:"Grade Strength",name:"canvasGradeAmount",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:2},default:1,description:"How strong the grade is, 0 to 1",...canvasShows(["clips"])},
  {displayName:"Wide Clips Fill",name:"canvasFill",type:"options",options:[{name:"Cover",value:"cover",description:"Fill the frame, the sides trimmed"},{name:"Blur",value:"blur",description:"A blurred copy behind it"},{name:"Bars",value:"bars",description:"Black bars"},{name:"Colour",value:"colour",description:"Bars in a colour"}],default:"blur",
    description:"How a wide clip fills the tall frame",...canvasShows(["clips"])},
  {displayName:"Fill Colour",name:"canvasFillColour",type:"color",default:"#000000",description:"The bars' colour",displayOptions:{show:{canvasPicture:["clips"],canvasFill:["colour"]}}},
  {displayName:"Speed",name:"canvasSpeed",type:"options",options:[0.25,...CLIP_SPEEDS].map(v=>({name:v+"×",value:v})),default:1,description:"How fast the clips play",...canvasShows(["clips"])},
  {displayName:"Crossfade (Seconds)",name:"canvasCrossfade",type:"number",typeOptions:{minValue:.25,maxValue:2,numberPrecision:2},default:.75,
    description:"Drift: how long the footage after the loop blends over its start, 0.25 to 2",displayOptions:{show:{canvasPicture:["clips"],canvasLoop:["drift"]}}},
  {displayName:"Camera",name:"canvasCamera",type:"options",options:[{name:"Still",value:"still"},{name:"Push In",value:"push"},{name:"Pull Out",value:"pull"}],default:"still",
    description:"A slow push in or pull out over each cut, or in and back out over a rebound",displayOptions:{show:{canvasPicture:["clips"],canvasLoop:["rebound","cuts"]}}},
  {displayName:"Fade at Loop Point",name:"canvasFade",type:"boolean",default:false,description:"Whether Cuts fade through black where the loop starts again",
    displayOptions:{show:{canvasPicture:["clips"],canvasLoop:["cuts"]}}},
  {displayName:"Framing Across",name:"canvasFramingX",type:"number",typeOptions:{minValue:-1,maxValue:1,numberPrecision:2},default:0,description:"Where the picture sits, -1 to 1 (1 shows its left edge)",...canvasShows(["clips"])},
  {displayName:"Framing Down",name:"canvasFramingY",type:"number",typeOptions:{minValue:-1,maxValue:1,numberPrecision:2},default:0,description:"Where the picture sits, -1 to 1 (1 shows its top)",...canvasShows(["clips"])},
  {displayName:"Zoom",name:"canvasZoom",type:"number",typeOptions:{minValue:1,maxValue:3,numberPrecision:2},default:1,description:"1 to 3",...canvasShows(["clips"])},
  {displayName:"Rotate",name:"canvasRotate",type:"options",options:[0,90,180,270].map(v=>({name:v+"°",value:v})),default:0,description:"A quarter turn or more, clockwise",...canvasShows(["clips"])},
  {displayName:"Steady",name:"canvasSteady",type:"boolean",default:false,description:"Whether each clip plays a stabilised copy (handheld shake smoothed out)",...canvasShows(["clips"])},
  {displayName:"Cut",name:"canvasCut",type:"options",options:[{name:"Hard Cut",value:"hard"},{name:"Smooth",value:"smooth"}],default:"hard",description:"How the clips meet in a Cuts loop",...canvasShows(["clips"])},
  {displayName:"Seed",name:"canvasSeed",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,
    description: 'Which clips are drawn; the same seed makes the same Canvas. 0: the first.',...canvasShows(["clips"])},
  {displayName:"Motion",name:"canvasMotion",type:"options",options:[{name:"Push In",value:"push"},{name:"Drift",value:"drift"},{name:"Still",value:"still"}],default:"push",
    description:"How the cover moves through the loop",...canvasShows(["cover"])},
  {displayName:"Visual",name:"canvasVisual",type:"string",default:"",placeholder:"sphericalShader/ring-funnel",
    description: 'A visual key from Get Options (canvas.visuals). Empty: one picked for the song.',...canvasShows(["visualizer"])},
  {displayName:"Prompt",name:"canvasPrompt",type:"string",typeOptions:{rows:2},default:"",placeholder:"Neon rain on a quiet street",
    description: 'Optional: what it shows (3 to 500 characters). Empty: written from the song or the cover.',...canvasShows(["generate"])},
  {displayName:"Idea From",name:"canvasFrom",type:"options",options:[{name:"The Song",value:"song",description:"What the song is about"},{name:"The Cover",value:"cover",description:"The cover's world, with the cover as the reference"}],default:"song",
    ...canvasShows(["generate"])},
  {displayName:"With",name:"canvasWith",type:"options",options:[{name:"Nobody",value:"none"},{name:"The Artist",value:"artist",description:"The song's artist, from their character"},{name:"A Cast Character",value:"character"}],default:"none",
    description:"Who appears in it",...canvasShows(["generate"])},
  {displayName:"Character ID",name:"canvasCharacterId",type:"string",default:"",placeholder:"kit_…",description:"A character from List Characters",
    displayOptions:{show:{canvasPicture:["generate"],canvasWith:["character"]}}},
  {displayName:"Made As",name:"canvasVideo",type:"options",options:[{name:"Standard Video",value:"standard",description:"Made to loop"},{name:"High Video",value:"high",description:"Sharper, for more credits"},{name:"Still",value:"still",description:"A picture, slowly moving"}],default:"standard",
    ...canvasShows(["generate"])},
  {displayName:"Loop",name:"canvasLoop",type:"options",options:[
    {name:"Drift",value:"drift",description:"One clip that flows into itself, with no seam"},
    {name:"Rebound",value:"rebound",description:"One clip forward, then backward (clips or a generated video)"},
    {name:"Cuts",value:"cuts",description:"Two or three clips with calm cuts (clips)"},
  ],default:"drift"},
  {displayName:"Length (Seconds)",name:"canvasSeconds",type:"number",typeOptions:{minValue:3,maxValue:8,numberPrecision:1},default:8,description:"3 to 8 seconds. Spotify loops it on its own, out of time with the song."},
  {displayName:"Light",name:"canvasLight",type:"string",default:"",placeholder:"polar-curves/halo-ring",description: 'Optional: a visual key from Get Options (canvas.visuals, one with over_picture true) drawn over the picture. Empty: none.'},
  {displayName:"Atmosphere",name:"canvasAtmosphere",type:"options",options:CANVAS_ATMOSPHERES.map(v=>({name:v[0]!.toUpperCase()+v.slice(1),value:v})),default:"none",description:"Something drifting over the picture"},
  effectsField("canvasEffects","Up to three, over the whole loop; they repeat with it, no seam"),
  {displayName:"Variations",name:"canvasVariations",type:"number",typeOptions:{minValue:1,maxValue:4,numberPrecision:0},default:1,
    description:"How many different Canvases to make (1–4), each drawing other clips, charged per Canvas",...canvasShows(["clips"])},
];
// How a music video is made (the API's model, category and style; GET /options lists them with music_video).
// A model or quality is ordered only when Get Options lists it for you (some are tried by staff first). Each description is the
// model's best-for line (video-types model-guide; the parity test holds them equal); Get Options gives the whole guide.
export const MUSIC_VIDEO_MODELS=[
  ["MiniMax H3 Max","one-take","Close-up singing and performance videos, for less."],
  ["Seedance 2.0","seedance-2-0","Dance, action, live and band videos: anything that moves."],
  ["Seedance 2.0 Fast","seedance-2-0-fast","Seedance movement for quick social cuts, for less."],
  ["Seedance 2.0 Mini","seedance-2-0-mini","Trying an idea in Seedance at the lowest Seedance price."],
  ["Seedance 2.5","seedance-2-5","Cinematic and moving videos with the newest Seedance."],
].map(([name,value,description])=>({name,value,description}));
export const MUSIC_VIDEO_QUALITIES=[
  ["480p","480p","Drafts and small screens; the lowest price"],
  ["720p","720p","HD, sharp on phones and in social feeds (Seedance)"],
  ["768p","768p","Sharp on phones and in social feeds (MiniMax H3 Max)"],
  ["1080p","1080p","Full HD for YouTube and a release"],
  ["4K","4k","Ultra HD for big screens; the highest price (Seedance 2.0)"],
].map(([name,value,description])=>({name,value,description}));
export const MUSIC_VIDEO_CATEGORIES=[
  ["Performance","performance","The artist sings to camera in one place that suits the song"],
  ["Performance & Story","intercut","The artist sings to camera, cut against them living the song's story"],
  ["Cinematic","cinematic","A performance on the move: long travelling takes through one place, singing to the lens"],
  ["Story","story","The artist lives the song's story, singing its lines inside it, never on a separate stage"],
  ["Surreal","surreal","Impossible things happen in ordinary places while the artist keeps singing"],
  ["Studio Session","studio","A live take in a recording room: the artist at the mic, the band around them"],
  ["Live Stage","live","On stage under the lights, the crowd a glow behind them"],
  ["At the Instrument","instrument","The artist plays and sings the song at their instrument: piano, guitar, decks or drums"],
  ["Lyric-Led Story","lyric-led","The artist lives the song's story and sings its key lines to the lens from inside it"],
  ["Phone Diary","vlog","Their own footage of a day, a trip or a tour, the lines sung into the phone"],
  ["Fashion Editorial","fashion","Poses, fabric and light, cut like a fashion film"],
  ["One Take","oner","One unbroken take with the artist from start to end, held still or travelling"],
  ["Story With a Cast","cast-story","Other people live the song's story; the artist doesn't appear (only models that make it: Get Options)"],
  ["Mood","mood","One material, its light and color moving with the music; no one on screen (only models that make it)"],
  ["Places","places","A journey through places that suit the song; no one on screen (only models that make it)"],
  ["Dance","dance","Choreography with dancers (only models that make it)"],
  ["Band","band","The whole band performs together (only models that make it)"],
  ["Action","action","A chase toward one goal, cut fast to the song (only models that make it)"],
].map(([name,value,description])=>({name,value,description}));
export const MUSIC_VIDEO_STYLES=[
  ["Natural","natural","True-to-life color and light"],
  ["Film","film","35 mm film: grain, soft contrast and rich color"],
  ["Golden Hour","golden-hour","Warm, low sunlight and long shadows"],
  ["Neon Night","neon-night","Night with colored neon and wet reflections"],
  ["Noir","noir","High-contrast black and white"],
  ["Vintage","vintage","A faded retro grade with period detail"],
  ["Dreamy","dreamy","Soft haze, glow and pastel light"],
  ["Super 8","super-8","Home-movie film: heavy grain, warm flicker, soft edges"],
  ["VHS","vhs","A camcorder tape: bleeding color, scan lines"],
  ["Documentary","documentary","Handheld and observed, natural light, nothing staged"],
  ["Glossy Pop","glossy-pop","Saturated, polished and bright"],
  ["Indie","indie","Muted, desaturated color and quiet, real places"],
  ["Cyberpunk","cyberpunk","Rain, holograms and a city of hard neon"],
  ["Y2K","y2k","Chrome, pastels and early-2000s gloss"],
  ["Lo-fi Bedroom","lofi","Warm lamps, soft focus, a small room at night"],
  ["Painterly","painterly","Moving like a painting (only models that make it)"],
  ["Anime","anime","Hand-drawn anime (only models that make it)"],
  ["Clay","clay","Stop-motion clay (only models that make it)"],
].map(([name,value,description])=>({name,value,description}));
// Cover art Kinetune makes (the API's style, vibes, artist and words; video-types cover-art, held equal by the parity test).
export const COVER_STYLES=[
  ["Kinetune Picks","auto","The director chooses for the song"],
  ["Portrait","portrait","The artist close, one decided light"],
  ["Snapshot","snapshot","Flash, candid, a moment caught"],
  ["Film Still","film-still","A frame from a film that doesn’t exist"],
  ["Object","object","One telling object"],
  ["Place","place","A place with its weather and hour"],
  ["Painted","painted","Real paint, visible brush"],
  ["Illustrated","illustrated","Drawn and printed, a few colours"],
  ["Cartoon","cartoon","Bold outlines, flat colour"],
  ["Anime","anime","Cel shading, a key frame"],
  ["Collage","collage","Cut paper, torn photos, tape"],
  ["3D","3d","Chrome, clay or glass, studio light"],
  ["Graphic","graphic","Shapes, colour, a grid"],
  ["Type","type","The words are the cover"],
].map(([name,value,description])=>({name,value,description}));
export const COVER_VIBES=[
  ["Dark","dark"],["Sad","sad"],["Romantic","romantic"],["Aggressive","aggressive"],["Luxury","luxury"],["Aesthetic","aesthetic"],
  ["Urban","urban"],["Hood","hood"],["Space","space"],["Surreal","surreal"],["Vintage","vintage"],
].map(([name,value])=>({name,value}));
export const COVER_WORDS=[
  ["None","none"],["Title","title"],["Artist and Title","artist_title"],
].map(([name,value])=>({name,value}));
export const COVER_ARTIST=[
  ["Director Decides","auto","On the cover when the idea is stronger with them, with the song's other person (always invented) beside them when the song is about two"],
  ["Always","always","Drawn from their character (Start Character); the song's other person (always invented) may stand beside them"],
  ["Never","never","No one on the cover"],
].map(([name,value,description])=>({name,value,description}));

const musicSection={musicLength:["section"]};
const musicBriefFields:INodeProperties[]=[
  {displayName:"Model",name:"musicModel",type:"options",options:MUSIC_VIDEO_MODELS,default:"one-take",description:"The Kinetune model that makes the music video"},
  {displayName:"Category",name:"musicCategory",type:"options",options:MUSIC_VIDEO_CATEGORIES,default:"performance",
    description:"The artist performs the song, lip-synced, in an AI music video made from their character (Start Character)"},
  {displayName:"Visual Style",name:"musicStyle",type:"options",description:"How the video is rendered",options:[{name:"Director's Choice",value:"",description:"The director picks the visual style from the cover"},...MUSIC_VIDEO_STYLES],default:""},
  {displayName:"Scenes",name:"musicScenes",type:"options",default:"invent",description:"The places the direction leaves open (a kit place it mentions is used as it is)",options:[
    {name:"Director Invents",value:"invent",description:"The director imagines them"},
    {name:"Director Finds Photos",value:"stock",description:"A real stock photo of each place, empty of people, with the artist put into it; the places share one era and style"}]},
  {displayName:"Format",name:"musicAspectRatio",type:"options",options:[{name:"Vertical 9:16",value:"9:16"},{name:"Wide 16:9",value:"16:9"},{name:"Square 1:1",value:"1:1"}],default:"9:16",
    description:"A music video is one file in one format"},
  {displayName:"Shots Meet",name:"musicTakes",type:"options",default:"cuts",description:"How the shots, cut between the song's lines, meet",options:[
    {name:"Edited",value:"cuts",description:"Like an edited music video: the shots meet with a cut"},
    {name:"Continuous Takes",value:"continuous",description:"The director may carry a shot on into the next through a picture drawn at the join (priced per picture)"}]},
  {displayName:"Outro",name:"musicOutro",type:"multiOptions",default:[],description: 'End on a release card after the last shot (the song plays on under it), showing these (none: no outro). Free.',
    options:[{name:"Cover Art",value:"cover"},{name:"Song Title",value:"title"},{name:"Artist Name",value:"artist"},{name:"Streaming Badges",value:"badges"}],displayOptions:{show:{operation:["quote","create"]}}},
  {displayName:"Outro Look ID",name:"musicOutroLookId",type:"string",default:"",description:"Optional: a lyric video Look whose card the outro uses as it is (empty: the director designs it)",displayOptions:{show:{operation:["quote","create"]}}},
  {displayName:"Finish Again: Video ID",name:"musicRefinishId",type:"string",default:"",description:"Finish this delivered music video again with the outro above (or none): no shot made, setup only",displayOptions:{show:{operation:["quote","create"]}}},
  {displayName:"Test the Chorus First",name:"musicTest",type:"boolean",default:false,description: 'Whether to make only the plan\'s chorus shots (about 20 seconds) at 480p, to check the face, the look and the lip-sync before the whole video. Needs a Plan ID; no outro.',displayOptions:{show:{operation:["quote","create"]}}},
  {displayName:"Casting ID",name:"musicCastingId",type:"string",default:"",placeholder:"casting_…",description:"Optional, without a plan: a casting (Cast Music Video) you said yes to in full; its people are drawn inside the order (a New cast line in the quote, only those drawn are charged) and added to the people",displayOptions:{show:{operation:["quote","create"]}}},
  {displayName:"Music Video Look ID",name:"musicLookId",type:"string",default:"",placeholder:"mvlook_…",description:"Optional: follow a music video Look (List Music Video Looks); send its category, style and takes too"},
  {displayName:"Lip-Sync",name:"musicLipsync",type:"options",default:"auto",description:"Whether the artist sings on camera",options:[
    {name:"Director Decides",value:"auto",description:"The important lines are sung on camera; wider shots let the song play over"},
    {name:"Never",value:"never",description:"Nobody sings on camera: the song plays over every shot"}]},
  {displayName:"Only What's in My Kit",name:"musicKitOnly",type:"options",default:"",description:"No other places, props, people or lighting than the kit's pictures show",options:[
    {name:"When the Direction Names a Kit Piece",value:"",description:"On when the direction mentions an outfit, place or prop by @handle"},
    {name:"On",value:"on",description:"Only what the kit's pictures show"},
    {name:"Off",value:"off",description:"The director may add places, props, people and light"}]},
  {displayName:"Length",name:"musicLength",type:"options",options:[{name:"Whole Song",value:"whole",description:"A song as long as Kinetune allows (Get Options: min_seconds to max_seconds, 15 seconds to 10 minutes today)"},{name:"A Section",value:"section",description:"A part of the song as long as Kinetune allows (15 seconds to 10 minutes today)"}],default:"whole",
    description:"The price follows the length. Its shots are made side by side, a few minutes for a minute of song."},
  {displayName:"Section Start (Seconds)",name:"musicStart",type:"number",typeOptions:{minValue:0,numberPrecision:1},default:0,displayOptions:{show:musicSection}},
  {displayName:"Section End (Seconds)",name:"musicEnd",type:"number",typeOptions:{minValue:0,numberPrecision:1},default:60,description:"After Section Start by Kinetune's shortest to longest (Get Options: min_seconds to max_seconds, 15 seconds to 10 minutes today)",displayOptions:{show:musicSection}},
  {displayName:"Direction",name:"musicDirection",type:"string",typeOptions:{rows:3},default:"",placeholder:"The @blue-set on the @rooftop, the @chrome-mic in hand",
    description:"Optional notes for the director: a place, an era, a story idea, mood. Kit pieces named by their @handle (List Kit) are used exactly as they are; the director designs the rest. Pin a change to a lyric or time with a sentence like On \"Drop it\" cut to @rooftop-club. (on every \"…\", or at 1:05): a shot starts exactly there. Words in (parentheses) in the lyrics are backing vocals, sung off camera."},
  {displayName:"Outfit From the Kit",name:"musicOutfitKit",type:"string",default:"",placeholder:"@blue-set",
    description:"A kit outfit's @handle the artist wears in every shot. Leave empty and the director dresses them."},
  {displayName:"On Screen",name:"musicOnScreen",type:"options",default:"",description:"Who is on screen. Default: the kind's. A cast or no one only where the model makes them (Get Options).",
    options:[{name:"The Kind's",value:""},{name:"The Artist",value:"artist"},{name:"A Cast",value:"cast"},{name:"No One",value:"none"}]},
  {displayName:"Performer (Character ID)",name:"musicPerformer",type:"string",default:"",placeholder:"kit_…",
    description:"Optional: the character who performs (List Characters), any artist's or the cast. Leave empty and the song's artist performs. Not for a story with a cast or a video with no one on screen."},
  {displayName:"People",name:"musicPeople",type:"fixedCollection",typeOptions:{multipleValues:true},default:{},placeholder:"Add a person",
    description: 'Optional: cast characters in the video besides the performer (List Characters: their handle). The director gives each a part from the kind and the song (the story, the band or dancers, a voice that sings with them) unless you say what they do.',
    options:[{name:"person",displayName:"Person",values:[{displayName:"Character Handle",name:"character",type:"string",default:"",placeholder:"mia-torres"},
      {displayName:"What They Do",name:"does",type:"string",default:"",placeholder:"Sings the second verse with her",description:"Optional, in your words"},
      {displayName:"What They Wear (Outfit Handle)",name:"outfit",type:"string",default:"",placeholder:"red-slip-dress",description: 'Optional: a kit outfit (List Kit), accessories included, drawn on them. Empty: the director dresses them.'}]}]},
  {displayName:"Who Else",name:"musicCastMode",type:"options",default:"",description:"Who else may be on screen besides the performer and the people above: nobody appears without a character sheet",options:[
    {name:"Director May Cast",value:"",description:"The API's default: the director may cast more people (Cast Music Video), each drawn only after you say yes"},
    {name:"Only Who I Picked",value:"exact",description:"Nobody else is shown: the song's other people are carried by the scene"}]},
];
const musicVideoFields:INodeProperties[]=[
  {displayName:"Plan ID",name:"musicPlanId",type:"string",default:"",placeholder:"plan_…",
    description:"Make the video from this shot list (Write Music Video Shot List): its brief replaces the fields below. Leave empty and the director writes it while it is made."},
  ...musicBriefFields,
  {displayName:"Quality",name:"musicQuality",type:"options",options:[{name:"Model's Default",value:"",description:"768p for MiniMax H3 Max, 720p for Seedance"},...MUSIC_VIDEO_QUALITIES],default:"",
    description: 'The resolution it is made at: the same video, sharper for more credits. Get Options lists the qualities each model is offered in.'},
  {displayName:"Variations",name:"musicVariations",type:"number",typeOptions:{minValue:1,maxValue:4,numberPrecision:0},default:1,description:"How many different music videos to make (1–4), charged per video"},
];
const shownWith=(show:Record<string,Array<string|number|boolean>>)=>(x:INodeProperties):INodeProperties=>({...x,displayOptions:{...(x.displayOptions||{}),show:{...(x.displayOptions?.show||{}),...show}}});
const onlyFor=(type:string)=>shownWith({videoType:[type]});
const generationFields:INodeProperties[]=[
  {displayName:"Video Type",name:"videoType",type:"options",options:[{name:"Lyric Video",value:"lyric-video"},{name:"Canvas (Spotify)",value:"canvas"},{name:"Music Video",value:"music-video"}],default:"lyric-video"},
  locator("Song","songId","searchReadySongs","a song",{required:true,description:"An analyzed song (status ready); the list shows only those"}),
  ...lyricFields.map(onlyFor("lyric-video")),
  ...canvasFields.map(onlyFor("canvas")),
  ...musicVideoFields.map(onlyFor("music-video")),
];

// Every operation, grouped by resource in version 2 (n8n shows a Resource, then its operations). Version 1 keeps the flat
// list its saved workflows were made with. The values never change: every field below shows by operation.
export const OPERATIONS=[
        {name:"Quote Video",value:"quote",description:"Calculate exact credits before rendering",action:"Quote a video"},
        {name:"Create Video",value:"create",description:"Render a video using a prior quote",action:"Create a video"},
        {name:"Create Upload URL",value:"createUpload",description:"Sends a binary file and returns its file_url, for a URL field of another tool or request (kept a day); the node's own uploads send files directly",action:"Create an upload URL"},
        {name:"Get Account",value:"getAccount",description:"The workspace (organization), its plan, the credentials' scopes and the credit balance",action:"Get the account"},
        {name:"List Workspaces",value:"listOrganizations",description:"The workspaces (organizations) of the key's creator, with type and role; current is the key's own (needs organizations:read)",action:"List workspaces"},
        {name:"Create Workspace",value:"createOrganization",description:"A new artist or label workspace owned by the key's creator, with no plan yet (needs organizations:write)",action:"Create a workspace"},
        {name:"Update Workspace",value:"updateOrganization",description:"Rename the key's workspace or switch it between artist and label (needs organizations:write)",action:"Update the workspace"},
        {name:"Write Music Video Shot List",value:"planMusicVideo",description:"The director's shot list for a music video: the concept and every shot, for the credits List Music Video Drafts shows (a rewrite costs the same), in about a minute; revise it with a note, then quote and create with its Plan ID",action:"Write a music video shot list"},
        {name:"Get Music Video Plan",value:"getMusicVideoPlan",action:"Get a music video plan"},
        {name:"Get Music Video Plan Being Written",value:"getMusicVideoPlanWrite",action:"Get a music video plan being written"},
        {name:"List Opening Frames",value:"listMusicVideoFrames",description:"The pictures a plan's shots open on, the price of one more, and the shots that can't have one",action:"List opening frames"},
        {name:"Get Storyboard",value:"getMusicVideoStoryboard",description:"A shot list as a storyboard: every shot with its picture so far, the outfits and what drawing the rest costs",action:"Get a music video storyboard"},
        {name:"Draw Opening Frame",value:"drawMusicVideoFrame",description:"Draws the picture a planned shot opens on, for the price shown (spends credits); the video starts that shot from it",action:"Draw an opening frame"},
        {name:"Check Shot List Model",value:"checkMusicVideoModel",description:"Whether a shot list can be kept with another model, what it needs first and what changes (nothing saved)",action:"Check another model for a shot list"},
        {name:"Switch Shot List Model",value:"switchMusicVideoModel",description:"Keeps a shot list with another model: the next draft, same shots, idea, people and frames (free)",action:"Switch a shot list's model"},
        {name:"Delete Shot List",value:"deleteMusicVideoPlan",description:"Deletes a shot list no video was made from, with every draft of it",action:"Delete a shot list"},
        {name:"List Music Video Drafts",value:"listMusicVideoDrafts",description:"A song's shot lists not made into a video yet (last 30 days), to pick one up, and what writing one costs (price.credits)",action:"List music video drafts"},
        {name:"Save Music Video Look",value:"saveMusicVideoLook",description:"A delivered music video's direction as a reusable Look (free; never the artist): use its ID as Look ID on another song",action:"Save a music video look"},
        {name:"List Music Video Looks",value:"listMusicVideoLooks",description:"Music video Looks made public, and the workspace's own",action:"List music video looks"},
        {name:"Get Music Video Look",value:"getMusicVideoLook",action:"Get a music video look"},
        {name:"Delete Music Video Look",value:"deleteMusicVideoLook",description:"Removes the workspace's own Look (its reward goes back if it was public)",action:"Delete a music video look"},
        {name:"Revise Music Video Shot",value:"reviseMusicVideoShot",description:"The director rewrites one shot of a delivered music video from a note, or several (More Shots), free: quote and create its Plan ID (with the video's quality) and only the shots made again are charged; the revision is a new video",action:"Revise a music video shot"},
        {name:"Price Music Video Revision",value:"priceMusicVideoRevision",description:"What revising each shot of a delivered music video costs, before anything is rewritten: each shot's credits, the setup paid once and another outro",action:"Price a music video revision"},
        {name:"List Shot List Versions",value:"listMusicVideoVersions",description:"Every version of a shot list, oldest first, with the note each was written from",action:"List a shot list's versions"},
        {name:"Delete Shot List Version",value:"deleteMusicVideoVersion",description:"Removes one version a video wasn't made from; its pictures stay",action:"Delete a version of a shot list"},
        {name:"List Shot List Pictures",value:"listMusicVideoPictures",description:"Every picture a shot list draws (places and their angles, outfits on its people, designed props), each once drawn, with its price",action:"List a shot list's pictures"},
        {name:"Draw Shot List Pictures",value:"drawMusicVideoPictures",description:"Draws a shot list's places, angles, outfits and props to see them before the video; each waits in the kit to be kept (spends credits once confirmed)",action:"Draw a shot list's pictures"},
        {name:"Leave Out a Set Angle",value:"dropMusicVideoAngle",description:"The next draft without one angle: its shots go back to the place's own picture",action:"Leave an angle out of a shot list"},
        {name:"Change Music Video Place",value:"swapMusicVideoPlace",description:"Another stock photo for one of a plan's places: the next draft, the same shots in that photo",action:"Change a music video place photo"},
        {name:"Get Video",value:"get",description:"Status, progress, credits and the download links; while it waits, queue says why (plan_limit with its place in line, or render_capacity with about how long, or generator_capacity for a music video waiting for a free generator)",action:"Get a video"},
        {name:"List Videos",value:"listVideos",description:"Newest first, a page at a time; filter by song, artist, type or a search. Pass next_cursor as Cursor for the next page. A waiting video has queue: why, and its place in line or about how long",action:"List videos"},
        {name:"Cancel Video",value:"cancel",action:"Cancel a video"},
        {name:"Delete Video",value:"deleteVideo",action:"Delete a video"},
        {name:"List Video Drafts",value:"listVideoDrafts",description:"Videos started in the studio and not made yet, one per song and kind, newest first (kept 30 days)",action:"List video drafts"},
        {name:"Delete Video Drafts",value:"deleteVideoDrafts",description:"One draft, or every draft (only a song's or a kind's); videos already made stay",action:"Delete video drafts"},
        {name:"Make Video Public",value:"shareVideo",description:"Shows a delivered video in the Community, its Look reusable by anyone; only on the person's own say-so (a music video needs their word that they may show the artist)",action:"Make a video public"},
        {name:"Make Video Private",value:"unshareVideo",description:"Takes a video out of the Community, its Look private again (its reward credits go back)",action:"Make a video private"},
        {name:"Retry Video",value:"retry",action:"Retry a video"},
        {name:"List Looks",value:"listLooks",action:"List looks"},
        {name:"Get Look",value:"getLook",action:"Get a look"},
        {name:"Get Look Clips",value:"getLookClips",action:"Get the clips of a clips look",description:"The clips a clips Look cuts its picture from, to preview it"},
        {name:"Rename Look",value:"renameLook",action:"Rename a look"},
        {name:"Delete Look",value:"deleteLook",action:"Delete a look"},
        {name:"Set Look Visibility",value:"setVisibility",description:"Public earns 10 credits; private returns them",action:"Set look visibility"},
        {name:"Save as Look",value:"saveLook",description:"A private Look made from a saved one with your changes (lyric style, visual, picture): use its ID as Look ID",action:"Save as a look"},
        {name:"Get Options",value:"options",description:"Lyric styles, visuals, clip moods, transitions and grades, formats, size ranges and credit prices",action:"Get options"},
        {name:"List Artists",value:"listArtists",action:"List artists"},
        {name:"Create Artist",value:"createArtist",action:"Create an artist"},
        {name:"Get Artist",value:"getArtist",action:"Get an artist"},
        {name:"Rename Artist",value:"renameArtist",action:"Rename an artist"},
        {name:"Archive Artist",value:"archiveArtist",description:"Only an artist without songs",action:"Archive an artist"},
        {name:"Find Artist in Catalog",value:"findArtistInCatalog",description:"Search the music catalog by artist name, to link their released songs",action:"Find an artist in the catalog"},
        {name:"Link Artist",value:"linkArtist",description:"Link an artist to their catalog profile, once",action:"Link an artist to their released songs"},
        {name:"List Released Songs",value:"listReleasedSongs",description:"A linked artist's released songs, each saying whether it's already in Kinetune",action:"List released songs"},
        {name:"Import Songs",value:"importSongs",description:"Bring in released songs without uploading: Kinetune fetches the audio",action:"Import released songs"},
        {name:"List Song Imports",value:"listSongImports",action:"List song imports"},
        {name:"Get Song Import",value:"getSongImport",action:"Get a song import"},
        {name:"Add Song Import File",value:"addSongImportAudio",description:"The audio of a released song Kinetune couldn't fetch",action:"Add the file to a song import"},
        {name:"Cancel Song Import",value:"cancelSongImport",description:"Let a failed import go",action:"Cancel a song import"},
        {name:"List Songs",value:"listSongs",action:"List songs"},
        {name:"Create Song",value:"createSong",action:"Create a song"},
        {name:"Get Song",value:"getSong",action:"Get a song"},
        {name:"Rename Song",value:"renameSong",action:"Rename a song"},
        {name:"Change Song Cover",value:"setSongCover",description:"Replace the cover art: videos already made keep theirs, new ones use it",action:"Change a song's cover"},
        {name:"Price Covers",value:"quoteCovers",description:"What a round of 1 to 4 covers costs, and redrawing one",action:"Price covers"},
        {name:"Make Covers",value:"makeCovers",description:"Kinetune's cover art director makes 1 to 4 covers for an analysed song, each a different idea (spends credits; needs a paid plan)",action:"Make covers"},
        {name:"Get Covers Round",value:"getCoverRequest",description:"A round's ideas, each with its cover once drawn",action:"Get a round of covers"},
        {name:"Redraw Cover",value:"redrawCover",description:"Draws one cover of a round again with your note (spends credits)",action:"Redraw a cover"},
        {name:"List Song Covers",value:"listSongCovers",description:"Every cover the song has had, made or uploaded, kept until deleted; the one in use marked",action:"List a song's covers"},
        {name:"Use Cover",value:"useCover",description:"Puts one of the song's covers in use: videos already made keep theirs, new ones use it",action:"Use a cover"},
        {name:"Delete Cover",value:"deleteCover",description:"Deletes one of the song's covers for good",action:"Delete a cover"},
        {name:"Download Song Cover",value:"downloadSongCover",description:"The link to the cover in use at full size (3000 px for a made cover), named Artist - Title; signed for 7 days",action:"Get a song's cover download link"},
        {name:"Download Song Audio",value:"downloadSongAudio",description:"The link to the audio as uploaded, named Artist - Title; signed for 7 days",action:"Get a song's audio download link"},
        {name:"Archive Song",value:"archiveSong",action:"Archive a song"},
        {name:"Analyze Song Again",value:"reanalyzeSong",description:"Retry a failed analysis",action:"Analyze a song again"},
        {name:"Set Song Lyrics",value:"setSongLyrics",description:"The song's own lyrics: videos spell every word right and break lines where you do",action:"Set a song's lyrics"},
        {name:"Remove Song Lyrics",value:"clearSongLyrics",description:"Back to the transcribed words",action:"Remove a song's lyrics"},
        {name:"Transcribe Song Again",value:"transcribeSong",description:"Listen to a song again with Kinetune's best transcription model (costs credits)",action:"Transcribe a song again"},
        {name:"Set Song Words",value:"setSongWords",description:"Fix the timed words by hand: text, start, end, line breaks",action:"Set a song's timed words"},
        {name:"Correct Song Brief",value:"editSongBrief",description:"Rewrite what the song is about (Get Song: brief) in your words: every director reads your version from then on",action:"Correct a song's brief"},
        {name:"Rewrite Song Brief",value:"rewriteSongBrief",description:"Drop your correction and read the song again (in the background: Get Song until brief.status is ready)",action:"Rewrite a song's brief"},
        {name:"Suggest an Idea",value:"suggestIdea",description:"A feature or change for Kinetune, posted under your name on the Community board for others to vote on (5 a day)",action:"Suggest an idea"},
        {name:"List Ideas",value:"listIdeas",description:"The Community board's ideas, most voted first, with your vote and follow; search before suggesting one",action:"List ideas"},
        {name:"Get Idea",value:"getIdea",description:"One idea with its comments and Kinetune's word on it",action:"Get an idea"},
        {name:"Vote for Idea",value:"voteForIdea",description:"Your vote for an open idea",action:"Vote for an idea"},
        {name:"Remove Idea Vote",value:"removeIdeaVote",description:"Take your vote back from an open idea",action:"Take back a vote"},
        {name:"Follow Idea",value:"followIdea",description:"An email when it ships (the Product news topic)",action:"Follow an idea"},
        {name:"Unfollow Idea",value:"unfollowIdea",action:"Stop following an idea"},
        {name:"Search Stock",value:"searchStock",description:"Stock photos or clips: a video to import into one of your folders or bring into a Canvas, a kit piece or a music video place",action:"Search stock media"},
        {name:"Get Video Draft",value:"getVideoDraft",description:"The person's own lyric video or Canvas draft (the editor's): its clips, the cut and the exact request to quote",action:"Get the video draft"},
        {name:"Change Video Draft",value:"editVideoDraft",description:"Change the draft as the editor would: Shuffle, a clip at a cut, a transition, sources, grade, effects, format",action:"Change the video draft"},
        {name:"Get Song Draft",value:"getSongDraft",description:"The Look and clips picture Kinetune picks for a song, at once and without AI: a lyric video without a Look ID makes exactly this",action:"Get a song's draft lyric video"},
        {name:"List Clips",value:"listClips",description:"The clips of Stock collections and your folders, with their length, shape, motion and a preview",action:"List clips"},
        {name:"Browse Collection",value:"browseClipMood",description:"The clips inside one Stock collection (Feelings or Places & textures), a page at a time, by shape and energy",action:"Browse a stock collection"},
        {name:"Similar Clips",value:"similarClips",description: 'More like this: clips from Stock and your folders that look and move like one clip. No AI, no credits.',action:"Find similar clips"},
        {name:"Clip as Rebound",value:"clipRebound",description: 'A clip forward, then backward: the file a Canvas Rebound loops. No AI, no credits.',action:"Get a clip as a rebound"},
        {name:"Clip Steadied",value:"clipSteady",description: 'A clip with handheld shake smoothed out: the file a Canvas with Steady plays. No AI, no credits.',action:"Get a clip steadied"},
        {name:"Clip Best Spot",value:"clipBestSpot",description: 'Where in a clip a Canvas Drift loops best, and its loop score. No AI, no credits.',action:"Find where a clip loops best"},
        {name:"Generate Clips",value:"generateClips",description:"New pictures or short video clips from a few words, the song or its cover, into your AI folder: 0 credits returns the price, the price shown makes them (spends credits)",action:"Generate clips"},
        {name:"Retry Clip Import",value:"retryClipImport",description:"Try a failed link, upload, stock or generated clip again (a generated one holds its credits again)",action:"Retry a clip import"},
        {name:"Dismiss Clip Import",value:"dismissClipImport",description:"Take a failed import's tile out of its folder",action:"Dismiss a clip import"},
        {name:"Delete Clip",value:"deleteClip",description:"Removes one of your clips; videos already made with it keep it",action:"Delete a clip"},
        {name:"List Clip Folders",value:"listClipFolders",description:"Your clip folders with how many clips each holds and how many are on their way",action:"List clip folders"},
        {name:"Create Clip Folder",value:"createClipFolder",action:"Create a clip folder"},
        {name:"Move Clips",value:"moveClips",description:"Move some of your clips into another of your folders",action:"Move clips"},
        {name:"Analyse Clips",value:"analyzeClips",description:"Find the subject and faces of clips a preview shows (a video made with them does this itself)",action:"Analyse clips"},
        {name:"Get Clip Folder",value:"getClipFolder",description:"A folder's clips and the imports still on their way",action:"Get a clip folder"},
        {name:"Rename Clip Folder",value:"renameClipFolder",action:"Rename a clip folder"},
        {name:"Delete Clip Folder",value:"deleteClipFolder",description:"Removes a folder and its clips; videos already made with them keep them",action:"Delete a clip folder"},
        {name:"List Canvas Presets",value:"listCanvasPresets",description:"Your saved Canvas looks (loop, length, grade, effects, light, atmosphere), the latest first",action:"List canvas presets"},
        {name:"Save Canvas Preset",value:"saveCanvasPreset",description: 'Keep a Canvas look under a name; the same name again replaces it. Free.',action:"Save a canvas preset"},
        {name:"Rename Canvas Preset",value:"renameCanvasPreset",action:"Rename a canvas preset"},
        {name:"Delete Canvas Preset",value:"deleteCanvasPreset",action:"Delete a canvas preset"},
        {name:"Import Clips",value:"importClips",description: 'Cuts a video into clips of 1 to 5 seconds in one of your folders, at every scene change: a link, a file or a stock video. Free.',action:"Import clips"},
        {name:"Set Artist Image",value:"setArtistImage",description:"Upload or replace the artist's picture on their page and in lists, cropped to a square",action:"Set an artist's image"},
        {name:"Remove Artist Image",value:"removeArtistImage",description:"The artist shows their initial until another image is set",action:"Remove an artist's image"},
        {name:"List Artist Profiles",value:"listArtistProfiles",description:"The artist's links on other services, in page order, and the automatic search's state; found ones stay unconfirmed until the user says they are theirs",action:"List an artist's profiles"},
        {name:"Add Artist Profile",value:"addArtistProfile",description:"Add one of the artist's links: the service is recognised from the address",action:"Add an artist profile"},
        {name:"Order Artist Profiles",value:"reorderArtistProfiles",description:"Put the artist's profiles in a new order; those left out keep their place after them",action:"Order an artist's profiles"},
        {name:"Update Artist Profile",value:"updateArtistProfile",description:"Confirm, hide, show, retitle or correct one of the artist's profiles",action:"Update an artist profile"},
        {name:"Remove Artist Profile",value:"removeArtistProfile",description:"Removes it for good: automatic searches never add the same link again (hide it to keep it)",action:"Remove an artist profile"},
        {name:"Add All Found Artist Profiles",value:"confirmAllArtistProfiles",description: 'Say every profile the automatic search found is the artist\'s: they go on the page at once. Only when all of them are theirs.',action:"Add all found artist profiles"},
        {name:"Find Artist Profiles",value:"discoverArtistProfiles",description:"Look for the artist's profiles on other services again, in the background; needs the Apple Music connection",action:"Find an artist's profiles"},
        {name:"Get Artist Page",value:"getArtistPage",description:"The artist's page at kinetune.com/@handle: its address, status, draft and whether the draft has unpublished changes",action:"Get an artist page"},
        {name:"Update Artist Page",value:"updateArtistPage",description:"Change the page's draft (look, genres, place, sections); fans see it only after Publish Artist Page",action:"Update an artist page"},
        {name:"Preview Artist Page",value:"previewArtistPage",description:"The draft as fans will see it once published",action:"Preview an artist page"},
        {name:"Publish Artist Page",value:"publishArtistPage",description:"Puts the draft live at kinetune.com/@handle (owners and admins); only on the user's say-so",action:"Publish an artist page"},
        {name:"Unpublish Artist Page",value:"unpublishArtistPage",description:"Takes the page offline; the address, draft and stats are kept",action:"Unpublish an artist page"},
        {name:"Get Artist Page Stats",value:"getArtistPageStats",description:"Views, visitors, clicks and click rate by day, service, link and referrer",action:"Get artist page stats"},
        {name:"Claim Artist Page Address",value:"claimArtistHandle",description:"Claim or change the page's address, kinetune.com/@handle (owners and admins)",action:"Claim an artist page address"},
        {name:"Check Page Address",value:"checkHandle",description:"Whether kinetune.com/@handle is free, with suggestions",action:"Check a page address"},
        {name:"Get Song Analysis",value:"songAnalysis",description:"Lyrics, beats, sections and the parts a video can be cut to, once analysis is ready",action:"Get song analysis"},
        {name:"List Characters",value:"listCharacters",description:"The people videos can show: your artists' characters and your cast",action:"List characters"},
        {name:"Get Face Check",value:"getFaceCheck",description:"Whether a model can show this real person yet: their face check for it",action:"Get a face check"},
        {name:"Start Face Check",value:"startFaceCheck",description:"The page where the person proves, live on camera, that the face is theirs",action:"Start a face check"},
        {name:"Withdraw Face Check",value:"withdrawFaceCheck",description:"Deletes the person's checked face: the model stops showing them",action:"Withdraw a face check"},
        {name:"Start Character",value:"startCharacter",description:"Photos of a person to draw a character sheet from, a finished sheet to add, or a made-up person described in words",action:"Start a character"},
        {name:"List Character Requests",value:"listCharacterRequests",description:"Character sheets being drawn, or drawn and paid for but not kept yet",action:"List sheets waiting to be kept"},
        {name:"Get Character Request",value:"getCharacterRequest",description:"What was read from the photos, the outfit line, and the sheet as drawn",action:"Get a character in the making"},
        {name:"Draw Character Sheet",value:"drawCharacterSheet",description:"Draws the sheet for the credits shown (again, with a note, to redraw)",action:"Draw a character sheet"},
        {name:"Keep Character",value:"keepCharacter",description:"Keeps the sheet in the kit, as an artist or as named cast",action:"Keep a character"},
        {name:"Discard Character Request",value:"discardCharacterRequest",action:"Discard a character in the making"},
        {name:"List Kit",value:"listKit",description:"Outfits, places and props a music video direction mentions by @handle",action:"List the kit"},
        {name:"Add Kit Piece",value:"addKitPiece",description:"An outfit, place or prop from an image, a link or a stock photo, cropped",action:"Add a kit piece"},
        {name:"Get Kit Piece",value:"getKitPiece",action:"Get a kit piece"},
        {name:"Change Kit Piece",value:"updateKitPiece",description:"Rename it, change its handle or description, or crop it again",action:"Change a kit piece"},
        {name:"Delete Kit Piece",value:"deleteKitPiece",action:"Delete a kit piece"},
        {name:"Draw Place Angles",value:"drawPlaceAngles",description:"The same set from other sides, each a new place to keep or leave out (spends credits once confirmed)",action:"Draw other angles of a place"},
        {name:"Cast Music Video",value:"castMusicVideo",description:"Free: the director proposes who else is in it (up to 3 people, each drawn only after your yes)",action:"Cast a music video"},
        {name:"Get Casting",value:"getCasting",description:"A casting's people as proposed, then as drawn, and the people to add to the brief",action:"Get a casting"},
        {name:"Draw Cast",value:"drawCast",description:"Draws the people you keep as character sheets for the credits shown (spends credits)",action:"Draw a music video's cast"},
        {name:"Delete Casting",value:"deleteCasting",description:"Deletes a casting; the people already kept stay in the kit",action:"Delete a casting"},
] satisfies INodePropertyOptions[];
type OperationValue=(typeof OPERATIONS)[number]["value"];
export const RESOURCES:{name:string,value:string,operations:OperationValue[]}[]=[
  {name:"Account",value:"account",operations:["getAccount","options","createUpload","listOrganizations","createOrganization","updateOrganization"]},
  {name:"Artist",value:"artist",operations:["listArtists","createArtist","getArtist","renameArtist","archiveArtist","findArtistInCatalog","linkArtist","setArtistImage","removeArtistImage"]},
  {name:"Artist Page",value:"artistPage",operations:["getArtistPage","updateArtistPage","previewArtistPage","publishArtistPage","unpublishArtistPage","getArtistPageStats","claimArtistHandle","checkHandle","listArtistProfiles","addArtistProfile","reorderArtistProfiles","updateArtistProfile","removeArtistProfile","confirmAllArtistProfiles","discoverArtistProfiles"]},
  {name:"Character",value:"character",operations:["listCharacters","startCharacter","listCharacterRequests","getCharacterRequest","drawCharacterSheet","keepCharacter","discardCharacterRequest","getFaceCheck","startFaceCheck","withdrawFaceCheck"]},
  {name:"Clip",value:"clip",operations:["listClips","browseClipMood","searchStock","similarClips","clipRebound","clipSteady","clipBestSpot","generateClips","importClips","retryClipImport","dismissClipImport","analyzeClips","moveClips","deleteClip"]},
  {name:"Clip Folder",value:"clipFolder",operations:["listClipFolders","createClipFolder","getClipFolder","renameClipFolder","deleteClipFolder"]},
  {name:"Cover",value:"cover",operations:["quoteCovers","makeCovers","getCoverRequest","redrawCover","listSongCovers","useCover","deleteCover","setSongCover","downloadSongCover"]},
  {name:"Idea",value:"idea",operations:["suggestIdea","listIdeas","getIdea","voteForIdea","removeIdeaVote","followIdea","unfollowIdea"]},
  {name:"Kit",value:"kit",operations:["listKit","addKitPiece","getKitPiece","updateKitPiece","deleteKitPiece","drawPlaceAngles","castMusicVideo","getCasting","drawCast","deleteCasting"]},
  {name:"Look",value:"look",operations:["listLooks","getLook","getLookClips","saveLook","renameLook","setVisibility","deleteLook","listMusicVideoLooks","getMusicVideoLook","saveMusicVideoLook","deleteMusicVideoLook","listCanvasPresets","saveCanvasPreset","renameCanvasPreset","deleteCanvasPreset"]},
  {name:"Music Video Shot List",value:"shotList",operations:["planMusicVideo","getMusicVideoPlan","getMusicVideoPlanWrite","listMusicVideoDrafts","getMusicVideoStoryboard","listMusicVideoFrames","drawMusicVideoFrame","listMusicVideoPictures","drawMusicVideoPictures","dropMusicVideoAngle","swapMusicVideoPlace","checkMusicVideoModel","switchMusicVideoModel","listMusicVideoVersions","deleteMusicVideoVersion","deleteMusicVideoPlan","priceMusicVideoRevision","reviseMusicVideoShot"]},
  {name:"Song",value:"song",operations:["listSongs","createSong","getSong","renameSong","archiveSong","songAnalysis","reanalyzeSong","transcribeSong","setSongLyrics","clearSongLyrics","setSongWords","editSongBrief","rewriteSongBrief","getSongDraft","downloadSongAudio"]},
  {name:"Song Import",value:"songImport",operations:["listReleasedSongs","importSongs","listSongImports","getSongImport","addSongImportAudio","cancelSongImport"]},
  {name:"Video",value:"video",operations:["quote","create","get","listVideos","cancel","retry","deleteVideo","shareVideo","unshareVideo","listVideoDrafts","getVideoDraft","editVideoDraft","deleteVideoDrafts"]},
];
const byName=(a:{name:string},b:{name:string})=>a.name.localeCompare(b.name);
const operationFields:INodeProperties[]=[
  {displayName:"Operation",name:"operation",type:"options",noDataExpression:true,default:"quote",options:[...OPERATIONS].sort(byName),displayOptions:{show:{"@version":[1]}}},
  {displayName:"Resource",name:"resource",type:"options",noDataExpression:true,default:"video",options:RESOURCES.map(({name,value})=>({name,value})),displayOptions:{show:{"@version":[2]}}},
  ...RESOURCES.map(r=>({displayName:"Operation",name:"operation",type:"options" as const,noDataExpression:true,default:r.operations[0]!,
    options:OPERATIONS.filter(o=>(r.operations as string[]).includes(o.value)).sort(byName),displayOptions:{show:{resource:[r.value],"@version":[2]}}})),
];

export class Kinetune implements INodeType {
  description:INodeTypeDescription={
    displayName:"Kinetune",
    name:"kinetune",
    icon:{light:"file:kinetune.svg",dark:"file:kinetune.svg"},
    group:["transform"],
    version:[1,2],
    defaultVersion:2,
    subtitle:"={{$parameter.operation}}",
    description:"Quote, render and manage lyric videos, Canvases, music videos and Looks",
    defaults:{name:"Kinetune"},
    inputs:[NodeConnectionTypes.Main],
    outputs:[NodeConnectionTypes.Main],
    credentials:[{name:"kinetuneApi",required:true}],
    properties:[
      ...operationFields,
      ...generationFields.map(shownWith({operation:["quote","create"]})),
      locator("Song","songId","searchReadySongs","a song",{required:true,description:"An analyzed song (status ready); its artist performs the video and needs their character (Start Character)",displayOptions:{show:{operation:["planMusicVideo","castMusicVideo"]}}}),
      ...musicBriefFields.map(shownWith({operation:["planMusicVideo","castMusicVideo"]})),
      {displayName:"Credits",name:"musicPlanCredits",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,required:true,
        description:"The price of writing the shot list (List Music Video Drafts: price.credits); a rewrite costs the same. Another price is refused with the current one. Charged once it is written, nothing if it fails",displayOptions:{show:{operation:["planMusicVideo"]}}},
      {displayName:"Wait for the Shot List",name:"musicWait",type:"boolean",default:true,description:"Whether to wait the minute or more it takes. Off: the answer is the shot list being written; read it with Get Music Video Plan Being Written until its status is ready.",displayOptions:{show:{operation:["planMusicVideo"]}}},
      {displayName:"Revise",name:"musicRevise",type:"collection",placeholder:"Add Revision",default:{},displayOptions:{show:{operation:["planMusicVideo"]}},
        description: 'Rewrite an earlier plan of this song with a note (the next draft). It keeps that plan\'s brief: only the fields you set here (left at their defaults, they aren\'t sent) change it.',
        options:[
          {displayName:"Plan ID",name:"planId",type:"string",default:"",placeholder:"plan_…",description:"The plan to rewrite"},
          {displayName:"Note",name:"note",type:"string",typeOptions:{rows:3},default:"",description:"What to change, up to 1000 characters"},
        ]},
      {displayName:"Write ID",name:"writeId",type:"string",default:"",required:true,placeholder:"write_…",description:"The shot list being written, from Plan Music Video with Wait off",displayOptions:{show:{operation:["getMusicVideoPlanWrite"]}}},
      {displayName:"Plan ID",name:"planId",type:"string",default:"",required:true,placeholder:"plan_…",displayOptions:{show:{operation:["getMusicVideoPlan","getMusicVideoStoryboard","deleteMusicVideoPlan","swapMusicVideoPlace","listMusicVideoFrames","drawMusicVideoFrame","checkMusicVideoModel","switchMusicVideoModel","listMusicVideoPictures","drawMusicVideoPictures","dropMusicVideoAngle","listMusicVideoVersions","deleteMusicVideoVersion"]}}},
      {displayName:"Version ID",name:"versionId",type:"string",default:"",required:true,placeholder:"plan_…",description: 'The version to delete (versions[].ID)',displayOptions:{show:{operation:["deleteMusicVideoVersion"]}}},
      {displayName:"Model",name:"switchModel",type:"options",options:MUSIC_VIDEO_MODELS,default:"seedance-2-5",required:true,description:"The model to keep the shot list with",displayOptions:{show:{operation:["checkMusicVideoModel","switchMusicVideoModel"]}}},
      {displayName:"Angle",name:"anglePlace",type:"number",typeOptions:{minValue:1,numberPrecision:0},default:1,required:true,description:"The angle's number in the plan (places[].index)",displayOptions:{show:{operation:["dropMusicVideoAngle"]}}},
      {displayName:"Pictures",name:"planPictures",type:"string",default:"",placeholder:"place:3, outfit:1, prop:2",description:"The pictures to draw (pictures[].key from List Shot List Pictures), comma-separated; empty: every one not drawn yet",displayOptions:{show:{operation:["drawMusicVideoPictures"]}}},
      {displayName:"Draw Again",name:"picturesRedraw",type:"boolean",default:false,description:"Whether to draw the pictures named again (paid again)",displayOptions:{show:{operation:["drawMusicVideoPictures"]}}},
      {displayName:"Draw Them",name:"picturesConfirm",type:"boolean",default:false,description:"Whether to draw them now (spends credits); off, only the price is returned",displayOptions:{show:{operation:["drawMusicVideoPictures"]}}},
      {displayName:"Credits",name:"picturesCredits",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,
        description:"The price shown (credits); another price is refused with the current one",displayOptions:{show:{operation:["drawMusicVideoPictures"],picturesConfirm:[true]}}},
      {displayName:"Draw All",name:"frameAll",type:"boolean",default:false,description:"Whether to draw every frame not drawn yet at once (List Opening Frames: batch_shots), for their total price",displayOptions:{show:{operation:["drawMusicVideoFrame"]}}},
      {displayName:"Shots",name:"frameShots",type:"string",default:"",placeholder:"1,4,7",description:"With Draw All: the shots List Opening Frames gives in batch_shots, comma-separated",displayOptions:{show:{operation:["drawMusicVideoFrame"],frameAll:[true]}}},
      {displayName:"Shot",name:"frameShot",type:"number",typeOptions:{minValue:1,numberPrecision:0},default:1,required:true,description:"The shot's number in the plan (shots[].index)",displayOptions:{show:{operation:["drawMusicVideoFrame"],frameAll:[false]}}},
      {displayName:"Credits",name:"frameCredits",type:"number",typeOptions:{minValue:1,numberPrecision:0},default:26,required:true,
        description:"The price shown (List Opening Frames: price.credits); another price is refused with the current one",displayOptions:{show:{operation:["drawMusicVideoFrame"]}}},
      {displayName:"Place",name:"place",type:"number",typeOptions:{minValue:1,numberPrecision:0},default:1,required:true,description:"The place's number in the plan (places[].index)",displayOptions:{show:{operation:["swapMusicVideoPlace"]}}},
      {displayName:"Stock Photo ID",name:"stockId",type:"string",default:"",required:true,description:"A stock photo of the same kind of place, with no people (Search Stock)",displayOptions:{show:{operation:["swapMusicVideoPlace"]}}},
      {displayName:"Quote ID",name:"quoteId",type:"string",default:"",required:true,displayOptions:{show:{operation:["create"]}},description:"The quote_id returned by Quote Video with the same inputs"},
      {displayName:"Delete",name:"draftScope",type:"options",options:[{name:"One Draft",value:"one"},{name:"All Drafts",value:"all",description:"Every draft of yours in the workspace, narrowed below"}],default:"one",displayOptions:{show:{operation:["deleteVideoDrafts"]}}},
      {displayName:"Draft ID",name:"draftId",type:"string",default:"",required:true,description:"From List Video Drafts",displayOptions:{show:{operation:["deleteVideoDrafts"],draftScope:["one"]}}},
      {displayName:"Only Song ID",name:"draftSongId",type:"string",default:"",description:"Only this song's drafts (left empty: every song)",displayOptions:{show:{operation:["deleteVideoDrafts"],draftScope:["all"]}}},
      {displayName:"Only Kind",name:"draftType",type:"options",options:[{name:"Every Kind",value:""},{name:"Lyric Video",value:"lyric-video"},{name:"Canvas",value:"canvas"},{name:"Music Video",value:"music-video"}],default:"",displayOptions:{show:{operation:["deleteVideoDrafts"],draftScope:["all"]}}},
      {displayName:"Video ID",name:"videoId",type:"string",default:"",required:true,displayOptions:{show:{operation:["get","cancel","retry","deleteVideo","reviseMusicVideoShot","priceMusicVideoRevision","saveMusicVideoLook","shareVideo","unshareVideo"]}}},
      {displayName:"I Have the Right to Show the People in It Publicly",name:"shareRightsConfirmed",type:"boolean",default:false,
        description:"Whether the person confirmed they have the right to show the artist and everyone in it publicly; a music video is refused without it",displayOptions:{show:{operation:["shareVideo"]}}},
      {displayName:"Kinetune May Post It on Its Socials",name:"shareSocials",type:"boolean",default:false,
        description:"Whether the person also lets Kinetune post it on TikTok, Instagram, YouTube and X, crediting them",displayOptions:{show:{operation:["shareVideo"]}}},
      {displayName:"Credit Handle",name:"shareCreditHandle",type:"string",default:"",placeholder:"@yourhandle",
        description:"The @handle to credit on the socials (letters, digits, dots and underscores, up to 30)",displayOptions:{show:{operation:["shareVideo"],shareSocials:[true]}}},
      {displayName:"Music Video Look ID",name:"musicVideoLookId",type:"string",default:"",required:true,placeholder:"mvlook_…",displayOptions:{show:{operation:["getMusicVideoLook","deleteMusicVideoLook"]}}},
      {displayName:"Which Looks",name:"musicVideoLookScope",type:"options",default:"all",options:[{name:"All",value:"all"},{name:"Community",value:"community"},{name:"Mine",value:"mine"}],displayOptions:{show:{operation:["listMusicVideoLooks"]}}},
      {displayName:"Shot",name:"revisedShot",type:"number",default:1,typeOptions:{minValue:1},required:true,description:"The shot to change (its index in the video's shots)",displayOptions:{show:{operation:["reviseMusicVideoShot"]}}},
      {displayName:"Note",name:"revisionNote",type:"string",typeOptions:{rows:3},default:"",required:true,description:"What should change, in the artist's words",displayOptions:{show:{operation:["reviseMusicVideoShot"]}}},
      {displayName:"More Shots",name:"moreRevisedShots",type:"fixedCollection",typeOptions:{multipleValues:true},default:{},placeholder:"Add a shot",
        description:"Optional: more shots to change in the same revision, each with its own note (up to 12 shots in all, each once): one plan, one new version",displayOptions:{show:{operation:["reviseMusicVideoShot"]}},
        options:[{name:"shot",displayName:"Shot",values:[{displayName:"Shot",name:"shot",type:"number",default:1,typeOptions:{minValue:1,numberPrecision:0},description:"The shot to change (its index in the video's shots)"},
          {displayName:"Note",name:"note",type:"string",typeOptions:{rows:2},default:"",description:"What should change, in the artist's words"}]}]},
      locator("Song","listSongId","searchSongs","a song",{description:"Only this song's videos; leave empty for all",displayOptions:{show:{operation:["listVideos"]}}}),
      {displayName:"Type",name:"listType",type:"options",options:[{name:"Any",value:""},{name:"Lyric Video",value:"lyric-video"},{name:"Canvas (Spotify)",value:"canvas"},{name:"Music Video",value:"music-video"}],default:"",displayOptions:{show:{operation:["listVideos"]}}},
      locator("Artist","listArtistId","searchArtists","an artist",{description:"Only videos of this artist's songs; leave empty for all",displayOptions:{show:{operation:["listVideos"]}}}),
      {displayName:"Search",name:"search",type:"string",default:"",placeholder:"Song, artist or Look",description:"Only videos whose song title, artist name, Look name or ID contains this",displayOptions:{show:{operation:["listVideos"]}}},
      {displayName:"Quote ID",name:"listQuoteId",type:"string",default:"",description:"Only the videos this quote made (none until it is used)",displayOptions:{show:{operation:["listVideos"]}}},
      {displayName:"Limit",name:"listLimit",type:"number",typeOptions:{minValue:1,maxValue:100},default:50,displayOptions:{show:{operation:["listVideos"]}}},
      {displayName:"Cursor",name:"listCursor",type:"string",default:"",description: 'Next_cursor from the previous page; leave empty for the first page',displayOptions:{show:{operation:["listVideos"]}}},
      {displayName:"Look ID",name:"lookId",type:"string",default:"",required:true,displayOptions:{show:{operation:["getLook","getLookClips","setVisibility","renameLook","deleteLook"]}}},
      {displayName:"New Name",name:"newName",type:"string",default:"",required:true,displayOptions:{show:{operation:["renameLook","renameArtist","renameSong"]}}},
      {displayName:"Visibility",name:"visibility",type:"options",options:[{name:"Public",value:"public"},{name:"Private",value:"private"}],default:"public",displayOptions:{show:{operation:["setVisibility"]}}},
      {displayName:"Library",name:"scope",type:"options",options:[{name:"All Available",value:"all"},{name:"Official",value:"official"},{name:"Community",value:"community"},{name:"Mine",value:"mine"}],default:"all",displayOptions:{show:{operation:["listLooks"]}}},
      {displayName:"Category",name:"category",type:"options",options:[{name:"Any",value:""},...CATEGORIES],default:"",displayOptions:{show:{operation:["listLooks"]}}},
      {displayName:"Lyric Style",name:"lookLyricStyle",type:"options",options:[{name:"Any",value:""},...LYRIC_STYLES],default:"",displayOptions:{show:{operation:["listLooks"]}}},
      locator("Artist","artistId","searchArtists","an artist",{description:"The artist of the song you're choosing for: Looks that show another artist are left out. Leave empty for all.",displayOptions:{show:{operation:["listLooks"]}}}),
      {displayName:"Workspace Name",name:"organizationName",type:"string",default:"",required:true,placeholder:"Night Shift Records",
        description:"2 to 80 characters. The key keeps acting for its own workspace: choose a plan in the new one and create an API key there to work in it.",displayOptions:{show:{operation:["createOrganization"]}}},
      {displayName:"Workspace Type",name:"organizationType",type:"options",options:[{name:"Artist (One Artist and Its Songs)",value:"artist"},{name:"Label or Team (a Roster of Artists)",value:"label"},{name:"Creator (Projects, a Performer Optional)",value:"creator"}],default:"label",
        displayOptions:{show:{operation:["createOrganization"]}}},
      {displayName:"New Name",name:"organizationNewName",type:"string",default:"",description:"Leave empty to keep the name",displayOptions:{show:{operation:["updateOrganization"]}}},
      {displayName:"Type",name:"organizationNewType",type:"options",options:[{name:"Keep",value:""},{name:"Artist",value:"artist"},{name:"Label",value:"label"},{name:"Creator",value:"creator"}],default:"",
        description:"An artist workspace holds one artist; a label can become one only while it has one artist or none",displayOptions:{show:{operation:["updateOrganization"]}}},
      {displayName:"Artist Name",name:"artistName",type:"string",default:"",required:true,displayOptions:{show:{operation:["createArtist"]}}},
      locator("Artist","artistId","searchArtists","an artist",{description:"Leave empty in an artist workspace: its songs are its artist's",displayOptions:{show:{operation:["createSong"]}}}),
      locator("Artist","artistId","searchArtists","an artist",{required:true,displayOptions:{show:{operation:["setArtistImage","removeArtistImage","getArtist","renameArtist","archiveArtist",
        "linkArtist","listReleasedSongs","importSongs"]}}}),
      {displayName:"Artist Name or Link",name:"catalogQuery",type:"string",default:"",required:true,placeholder:"Nina Kazora",
        description:"The full name the artist releases under, or their Apple Music artist link",displayOptions:{show:{operation:["findArtistInCatalog"]}}},
      {displayName:"Catalog Artist ID",name:"catalogArtistId",type:"string",default:"",required:true,description: 'The ID from Find Artist in Catalog',displayOptions:{show:{operation:["linkArtist"]}}},
      {displayName:"Artist Authorization Confirmed",name:"catalogConfirmed",type:"boolean",default:false,
        description:"Whether the user confirmed they are the selected artist or authorized to manage their releases",displayOptions:{show:{operation:["linkArtist"]}}},
      {displayName:"Search Released Songs",name:"releasedQuery",type:"string",default:"",description:"Part of a title or release name",displayOptions:{show:{operation:["listReleasedSongs"]}}},
      {displayName:"Track IDs",name:"trackIds",type:"string",default:"",required:true,placeholder:"6817595861, 6816549264",
        description: 'The released songs to bring in, comma-separated (List Released Songs: ID). Only the artist\'s own songs.',displayOptions:{show:{operation:["importSongs"]}}},
      {displayName:"Import ID",name:"importId",type:"string",default:"",required:true,placeholder:"import_…",displayOptions:{show:{operation:["getSongImport","addSongImportAudio","cancelSongImport"]}}},
      {displayName:"Import Status",name:"importStatus",type:"options",default:"",options:[{name:"Any",value:""},{name:"Done",value:"done"},{name:"Failed",value:"failed"},
        {name:"Fetching",value:"fetching"},{name:"Queued",value:"queued"}],displayOptions:{show:{operation:["listSongImports"]}}},
      // Music lists: search, filters and paging, as the API takes them (q, status, sort, limit, offset).
      locator("Artist","artistId","searchArtists","an artist",{description:"Only this artist's songs; leave empty for all",displayOptions:{show:{operation:["listSongs"]}}}),
      {displayName:"Search",name:"search",type:"string",default:"",placeholder:"Part of the name",description:"Only artists whose name contains this",displayOptions:{show:{operation:["listArtists"]}}},
      {displayName:"Search",name:"search",type:"string",default:"",placeholder:"Part of the title or artist name",description:"Only songs whose title or artist name contains this",displayOptions:{show:{operation:["listSongs"]}}},
      {displayName:"Analysis Status",name:"songStatus",type:"options",options:[{name:"Any",value:""},{name:"Failed",value:"failed"},{name:"Pending",value:"pending"},{name:"Processing",value:"processing"},{name:"Ready",value:"ready",description:"Analyzed: usable for videos"}],default:"",displayOptions:{show:{operation:["listSongs"]}}},
      {displayName:"Parts For",name:"partsFor",type:"options",options:[{name:"Lyric Video",value:8,description:"Parts of 8 seconds and longer"},{name:"Music Video",value:15,description:"Parts of 15 seconds and longer; long sections cut into clips no shorter"}],default:8,
        description:"The analysis lists where a video can start and end without cutting a word (parts, default_part): pass one as a video's trim",displayOptions:{show:{operation:["songAnalysis"]}}},
      {displayName:"Sort",name:"songSort",type:"options",options:[{name:"Title",value:"title",description:"By artist, then title"},{name:"Newest",value:"newest",description:"Latest uploads first"}],default:"title",displayOptions:{show:{operation:["listSongs"]}}},
      {displayName:"Include Videos",name:"includeVideos",type:"boolean",default:false,description:"Whether each song also returns its lyric videos, Canvases and music videos (ready, in production, the newest one's poster) and your own draft of each",displayOptions:{show:{operation:["listSongs"]}}},
      {displayName:"Limit",name:"listLimit",type:"number",typeOptions:{minValue:1,maxValue:100},default:50,description:"Max number of results to return",displayOptions:{show:{operation:["listArtists","listSongs"]}}},
      {displayName:"Offset",name:"listOffset",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,description:"How many results to skip: add the limit to get the next page",displayOptions:{show:{operation:["listArtists","listSongs"]}}},
      {displayName:"Mode",name:"characterMode",type:"options",default:"generate",options:[{name:"Generate From Photos",value:"generate",description:"1 to 6 photos of the person; the sheet is drawn for credits (needs a plan)"},{name:"Add a Finished Sheet",value:"add",description:"One sheet, kept as it is, free (works without a plan)"},{name:"Camera Shots",value:"camera",description:"The six shots of Take from camera in order (or the three head shots); cut out and laid out as a sheet, free (works without a plan)"},{name:"Describe a Made-Up Person",value:"describe",description:"No photos: a made-up adult from a description, drawn for credits (needs a plan) and kept AI-made"}],displayOptions:{show:{operation:["startCharacter"]}}},
      {displayName:"Description",name:"characterDescription",type:"string",typeOptions:{rows:4},default:"",required:true,placeholder:"Late twenties, tall and athletic. A short silver bob, freckles…",
        description:"Who they are: looks, age, build, hair, style (10 to 600 characters). A made-up adult, never a real or famous person.",displayOptions:{show:{operation:["startCharacter"],characterMode:["describe"]}}},
      {displayName:"Image Binary Properties",name:"characterBinaryProperties",type:"string",default:"photo",required:true,placeholder:"photo1,photo2",
        description:"Comma-separated binary properties holding the photos (1 to 6), or the one sheet",displayOptions:{show:{operation:["startCharacter"]},hide:{characterMode:["describe"]}}},
      {displayName:"I Have the Rights to These Images",name:"characterRights",type:"boolean",default:false,required:true,
        description:"Whether you have the rights to use these images of this person; uploads are refused without it",displayOptions:{show:{operation:["startCharacter"]},hide:{characterMode:["describe"]}}},
      {displayName:"Character ID",name:"faceCheckCharacterId",type:"string",default:"",required:true,placeholder:"kit_…",displayOptions:{show:{operation:["getFaceCheck","startFaceCheck","withdrawFaceCheck"]}}},
      {displayName:"Model",name:"faceCheckModel",type:"options",options:MUSIC_VIDEO_MODELS,default:"seedance-2-5",required:true,
        description:"The music video model the face check is for (Get Options: models[].face_check); one check covers every model that shares it",displayOptions:{show:{operation:["getFaceCheck","startFaceCheck","withdrawFaceCheck"]}}},
      {displayName:"The Person Agreed to the Face Check",name:"faceCheckConsent",type:"boolean",default:false,required:true,
        description:"Whether the person shown agreed to Kinetune checking their face and keeping it to match their pictures (kinetune.com/privacy, Face checks); refused without it",displayOptions:{show:{operation:["startFaceCheck"]}}},
      {displayName:"Request ID",name:"characterRequestId",type:"string",default:"",required:true,placeholder:"charreq_…",displayOptions:{show:{operation:["getCharacterRequest","drawCharacterSheet","keepCharacter","discardCharacterRequest"]}}},
      {displayName:"Credits",name:"characterCredits",type:"number",typeOptions:{minValue:1,numberPrecision:0},default:20,required:true,description:"The price shown (Get Character Request: price.credits)",displayOptions:{show:{operation:["drawCharacterSheet"]}}},
      {displayName:"Outfit",name:"characterOutfit",type:"string",default:"",description:"The base outfit line (empty: the one read from the photos); always drawn plain",displayOptions:{show:{operation:["drawCharacterSheet"]}}},
      {displayName:"Note",name:"characterNote",type:"string",default:"",description:"What to change when drawing again",displayOptions:{show:{operation:["drawCharacterSheet"]}}},
      {displayName:"Artist ID",name:"characterArtistId",type:"string",default:"",placeholder:"artist_…",description:"It is this artist (or leave empty and give a name: cast)",displayOptions:{show:{operation:["keepCharacter","listCharacters"]}}},
      {displayName:"Characters",name:"characterListScope",type:"options",default:"artist",
        options:[{name:"The Artist's Own Character",value:"artist"},{name:"In the Artist's Kit",value:"owner",description:"Their own character and the people kept for them"},
          {name:"For the Artist's Videos",value:"for",description:"Theirs first, then those other artists shared"}],
        description:"Which characters of the artist to list (with an Artist ID)",displayOptions:{show:{operation:["listCharacters"]}}},
      {displayName:"Name",name:"characterName",type:"string",default:"",description:"A cast member's name (when it isn't an artist)",displayOptions:{show:{operation:["keepCharacter"]}}},
      {displayName:"Kit Of (Artist ID)",name:"characterOwnerId",type:"string",default:"",placeholder:"artist_…",
        description:"A cast member: the artist whose kit they go in (empty: the workspace's only artist, else its first, shared)",displayOptions:{show:{operation:["keepCharacter"]}}},
      {displayName:"Share With All Artists",name:"kitShared",type:"boolean",default:false,description:"Whether every other artist's videos can use it too",displayOptions:{show:{operation:["keepCharacter","addKitPiece"]}}},
      {displayName:"Replace the Artist's Character",name:"characterReplace",type:"boolean",default:false,displayOptions:{show:{operation:["keepCharacter"]}}},
      {displayName:"Person",name:"characterPerson",type:"options",default:"",
        options:[{name:"Not Said (Counts as Real)",value:""},{name:"Real Person (Seedance Needs Their Face Check)",value:"real"},{name:"AI-Made, Looks Like No Real Person",value:"ai"}],
        description:"Whether the character shows a real person or an AI-made one; for a kit piece, characters only",displayOptions:{show:{operation:["keepCharacter","updateKitPiece"]}}},
      // Clips: the library's and your folders', and Save as Look.
      {displayName:"Clip Moods",name:"clipMoods",type:"string",default:"",placeholder:"city,golden",description: 'Stock collection IDs from Get Options (clip_moods), comma-separated',displayOptions:{show:{operation:["listClips"]}}},
      {displayName:"Clip Folders",name:"clipFolders",type:"string",default:"",placeholder:"folder_…",description: 'Your clip folder IDs (List Clip Folders), comma-separated',displayOptions:{show:{operation:["listClips"]}}},
      {displayName:"Clip Looks",name:"clipLooks",type:"string",default:"",placeholder:"look_…",description: 'Look IDs whose own picture plays as clips, comma-separated',displayOptions:{show:{operation:["listClips"]}}},
      {displayName:"Prompt",name:"clipPrompt",type:"string",typeOptions:{rows:2},default:"",placeholder:"A diner at 3am, rain on the window",
        description: 'What it shows (3 to 500 characters). Optional with Idea From.',displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"Idea From",name:"clipFrom",type:"options",options:[{name:"Only the Prompt",value:""},{name:"The Song",value:"song",description:"What the song is about"},{name:"The Cover",value:"cover",description:"The cover's world, with the cover as the reference"}],default:"",
        displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"Song ID",name:"clipSongId",type:"string",default:"",placeholder:"song_…",description:"The song it is for (needed with Idea From or With)",displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"With",name:"clipWith",type:"string",default:"",placeholder:"artist",description: 'Who appears: empty for nobody, artist (the song\'s artist, from their character) or a cast character\'s ID (kit_…)',displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"Video Model",name:"clipModel",type:"string",default:"",placeholder:"bytedance/seedance-v1.0-pro",description:"The video model's ID from Get Options (video_models.clips). Empty: the default model.",displayOptions:{show:{operation:["generateClips"],clipKind:["video"]}}},
      {displayName:"Video Quality",name:"clipQuality",type:"options",options:[{name:"Standard",value:"standard"},{name:"High",value:"high"}],default:"standard",description:"Used when Video Model is empty: Standard is the default model, High the dearest one offered",displayOptions:{show:{operation:["generateClips"],clipKind:["video"]}}},
      {displayName:"Style",name:"clipStyle",type:"options",options:[{name:"As the Prompt Says",value:""},...GENERATE_STYLES],default:"",
        description:"How it moves and feels: shapes the motion, camera and pace",displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"Made to Loop",name:"clipLoop",type:"boolean",default:false,description:"Whether the video starts and ends on the same frame: a seamless Drift for a Canvas",displayOptions:{show:{operation:["generateClips"],clipKind:["video"]}}},
      {displayName:"Kind",name:"clipKind",type:"options",options:[{name:"Picture",value:"image"},{name:"Video Clip",value:"video"}],default:"video",displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"Shape",name:"clipGenerateShape",type:"options",options:[{name:"Tall",value:"tall"},{name:"Wide",value:"wide"}],default:"tall",displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"How Many",name:"clipCount",type:"number",typeOptions:{minValue:1,maxValue:4,numberPrecision:0},default:1,description:"1 to 4",displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"Credits",name:"clipCredits",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,
        description:"0: only the price (quote.credits). The price shown: they are made in the background (Get Clip Folder on the returned folder_id), each charged once it is a clip. Needs a plan",
        displayOptions:{show:{operation:["generateClips"]}}},
      {displayName:"Collection ID",name:"clipMoodId",type:"string",default:"",required:true,placeholder:"city",description: 'A Stock collection ID from Get Options (clip_moods)',displayOptions:{show:{operation:["browseClipMood"]}}},
      {displayName:"Shape",name:"clipBrowseShape",type:"options",options:BROWSE_SHAPES,default:"both",description:"Tall or wide clips only",displayOptions:{show:{operation:["browseClipMood"]}}},
      {displayName:"Energy",name:"clipEnergy",type:"options",options:BROWSE_ENERGIES,default:"all",description:"The collection's calmest, middle or liveliest third",displayOptions:{show:{operation:["browseClipMood"]}}},
      {displayName:"Sort",name:"clipSort",type:"options",options:BROWSE_SORTS,default:"best",displayOptions:{show:{operation:["browseClipMood"]}}},
      {displayName:"Offset",name:"clipOffset",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,description:"Where the page starts: the last page's next_offset",displayOptions:{show:{operation:["browseClipMood"]}}},
      {displayName:"Limit",name:"clipLimit",type:"number",typeOptions:{minValue:1,maxValue:120,numberPrecision:0},default:60,description:"Max number of results to return",displayOptions:{show:{operation:["browseClipMood"]}}},
      {displayName:"Clip ID",name:"clipId",type:"string",default:"",required:true,placeholder:"clip_…",displayOptions:{show:{operation:["deleteClip","similarClips","clipRebound","clipSteady","clipBestSpot"]}}},
      {displayName:"Start (Seconds)",name:"reboundAt",type:"number",typeOptions:{minValue:0,maxValue:600,numberPrecision:1},default:0,description:"Where in the clip it starts",displayOptions:{show:{operation:["clipRebound"]}}},
      {displayName:"Forward (Seconds)",name:"reboundHalf",type:"number",typeOptions:{minValue:1.5,maxValue:4,numberPrecision:1},default:4,description:"How long it plays forward, 1.5 to 4 (the loop is twice that)",displayOptions:{show:{operation:["clipRebound"]}}},
      {displayName:"Speed",name:"reboundSpeed",type:"options",options:[0.25,0.5,0.75,1,1.5,2].map(v=>({name:v+"×",value:v})),default:1,displayOptions:{show:{operation:["clipRebound"]}}},
      {displayName:"Steady",name:"reboundSteady",type:"boolean",default:false,description:"Whether it is made from the clip's stabilised copy",displayOptions:{show:{operation:["clipRebound"]}}},
      {displayName:"Window (Seconds)",name:"loopSpan",type:"number",typeOptions:{minValue:.5,maxValue:60,numberPrecision:2},default:4,
        description:"How much of the clip the loop plays before it starts again, in seconds of the clip",displayOptions:{show:{operation:["clipBestSpot"]}}},
      {displayName:"Crossfade (Seconds)",name:"loopSeam",type:"number",typeOptions:{minValue:0,maxValue:4,numberPrecision:2},default:.75,
        description:"How much more it plays into the crossfade, in seconds of the clip",displayOptions:{show:{operation:["clipBestSpot"]}}},
      {displayName:"Import ID",name:"clipImportId",type:"string",default:"",required:true,placeholder:"import_…",description:"A failed import from Get Clip Folder",displayOptions:{show:{operation:["retryClipImport","dismissClipImport"]}}},
      {displayName:"How Many",name:"clipSimilarLimit",type:"number",typeOptions:{minValue:1,maxValue:48,numberPrecision:0},default:24,description:"1 to 48",displayOptions:{show:{operation:["similarClips"]}}},
      {displayName:"Preset Name",name:"canvasPresetName",type:"string",default:"",required:true,placeholder:"Night drive",description:"Up to 60 characters",displayOptions:{show:{operation:["saveCanvasPreset","renameCanvasPreset"]}}},
      {displayName:"Look (JSON)",name:"canvasPresetLook",type:"json",default:"{\n  \"loop\": \"drift\",\n  \"seconds\": 8\n}",required:true,
        description: 'Loop, seconds, cut, crossfade, camera, fade, fill, fill_colour, speed, grade, grade_amount, effects, light, atmosphere (as List Canvas Presets shows them); left out: their defaults',displayOptions:{show:{operation:["saveCanvasPreset"]}}},
      {displayName:"Preset ID",name:"canvasPresetId",type:"string",default:"",required:true,placeholder:"preset_…",displayOptions:{show:{operation:["renameCanvasPreset","deleteCanvasPreset"]}}},
      {displayName:"Folder Name",name:"clipFolderName",type:"string",default:"",required:true,placeholder:"On stage",description:"Up to 60 characters",displayOptions:{show:{operation:["createClipFolder"]}}},
      {displayName:"Folder ID",name:"clipFolderId",type:"string",default:"",required:true,placeholder:"folder_…",displayOptions:{show:{operation:["getClipFolder","renameClipFolder","deleteClipFolder","importClips","moveClips"]}}},
      {displayName:"Clip IDs",name:"clipIds",type:"string",default:"",required:true,placeholder:"clip_…, clip_…",description:"Your clips to move, comma-separated (1–200)",displayOptions:{show:{operation:["moveClips"]}}},
      {displayName:"Clip IDs",name:"analyzeClipIds",type:"string",default:"",required:true,placeholder:"clip_…, clip_…",description:"The clips a preview shows, comma-separated (1–200)",displayOptions:{show:{operation:["analyzeClips"]}}},
      {displayName:"Words Behind the Subject",name:"analyzeBehind",type:"boolean",default:false,description:"Whether the words go behind the subject (makes the mattes too)",displayOptions:{show:{operation:["analyzeClips"]}}},
      {displayName:"New Name",name:"clipFolderName",type:"string",default:"",required:true,description:"Up to 60 characters",displayOptions:{show:{operation:["renameClipFolder"]}}},
      {displayName:"Import From",name:"clipImportSource",type:"options",options:[
        {name:"Link",value:"url",description:"A YouTube, TikTok or Instagram link, up to 20 minutes"},
        {name:"File URL",value:"file",description:"A video or photo sent with Create Upload URL (its file_url)"},
        {name:"Stock Video",value:"stock",description:"A video from Search Stock (Kind: Video)"},
      ],default:"url",description: 'Only clips you have the rights to. Free; counts toward your storage.',displayOptions:{show:{operation:["importClips"]}}},
      {displayName:"Link",name:"clipImportUrl",type:"string",default:"",required:true,placeholder:"https://www.youtube.com/watch?v=…",displayOptions:{show:{operation:["importClips"],clipImportSource:["url"]}}},
      {displayName:"File URL",name:"clipImportFileUrl",type:"string",default:"",required:true,placeholder:"https://…",displayOptions:{show:{operation:["importClips"],clipImportSource:["file"]}}},
      {displayName:"Stock Video ID",name:"clipImportStockId",type:"string",default:"",required:true,placeholder:"3571264",displayOptions:{show:{operation:["importClips"],clipImportSource:["stock"]}}},
      {displayName:"Name",name:"lookName",type:"string",default:"",required:true,placeholder:"Night drive",description:"2 to 60 characters",displayOptions:{show:{operation:["saveLook"]}}},
      {displayName:"From Look ID",name:"fromLookId",type:"string",default:"",required:true,placeholder:"look_…",description:"The saved Look it starts from (List Looks, or Get Song Draft's look_id)",displayOptions:{show:{operation:["saveLook"]}}},
      ...lookChangeFields.map(shownWith({operation:["saveLook"]})),
      {displayName:"Kind",name:"stockKind",type:"options",options:[{name:"Photo",value:"photo"},{name:"Video",value:"video"}],default:"photo",displayOptions:{show:{operation:["searchStock"]}}},
      {displayName:"Search",name:"stockQuery",type:"string",default:"",required:true,placeholder:"foggy pine forest",displayOptions:{show:{operation:["searchStock"]}}},
      {displayName:"Orientation",name:"stockOrientation",type:"options",options:[{name:"Portrait",value:"portrait",description:"For 9:16 and 1:1, and Canvases"},{name:"Landscape",value:"landscape",description:"When 16:9 is among the formats"}],default:"portrait",displayOptions:{show:{operation:["searchStock"]}}},
      {displayName:"Canvas Length (Seconds)",name:"stockSeconds",type:"number",typeOptions:{minValue:0,maxValue:8,numberPrecision:0},default:0,
        description:"Videos for a Canvas: only clips long enough for a loop this long (5–8). Leave 0 for clips to import.",displayOptions:{show:{operation:["searchStock"],stockKind:["video"]}}},
      {displayName:"Page",name:"stockPage",type:"number",typeOptions:{minValue:1,maxValue:50,numberPrecision:0},default:1,description:"24 results a page",displayOptions:{show:{operation:["searchStock"]}}},
      {displayName:"Idea",name:"ideaTitle",type:"string",default:"",required:true,placeholder:"Export a 15-second cut of the hook for TikTok",
        description:"The idea in one line (6–120 characters)",displayOptions:{show:{operation:["suggestIdea"]}}},
      {displayName:"Details",name:"ideaBody",type:"string",typeOptions:{rows:3},default:"",description:"Optional: how you would use it (up to 2,000 characters)",displayOptions:{show:{operation:["suggestIdea"]}}},
      {displayName:"About",name:"ideaArea",type:"options",options:[{name:"Whole App",value:"everything"},{name:"Lyric Videos",value:"lyric-video"},{name:"Canvases",value:"canvas"},{name:"Music Videos",value:"music-video"}],
        default:"everything",displayOptions:{show:{operation:["suggestIdea"]}}},
      {displayName:"Idea ID",name:"ideaId",type:"string",default:"",required:true,placeholder:"idea_…",displayOptions:{show:{operation:["getIdea","voteForIdea","removeIdeaVote","followIdea","unfollowIdea"]}}},
      {displayName:"Search",name:"ideaSearch",type:"string",default:"",description:"Words in the title or details",displayOptions:{show:{operation:["listIdeas"]}}},
      {displayName:"Sort",name:"ideaSort",type:"options",options:[{name:"Most Voted",value:"top"},{name:"Newest",value:"new"}],default:"top",displayOptions:{show:{operation:["listIdeas"]}}},
      {displayName:"Status",name:"ideaStatus",type:"options",options:[{name:"Any",value:""},{name:"Declined",value:"declined"},{name:"In Progress",value:"in_progress"},{name:"Open",value:"open"},
        {name:"Planned",value:"planned"},{name:"Shipped",value:"shipped"},{name:"Under Review",value:"under_review"}],default:"",displayOptions:{show:{operation:["listIdeas"]}}},
      {displayName:"About",name:"ideaListArea",type:"options",options:[{name:"Any",value:""},{name:"Canvases",value:"canvas"},{name:"Lyric Videos",value:"lyric-video"},{name:"Music Videos",value:"music-video"},{name:"Whole App",value:"everything"}],
        default:"",displayOptions:{show:{operation:["listIdeas"]}}},
      {displayName:"Only Yours",name:"ideaYours",type:"boolean",default:false,description:"Whether to list only the ones you suggested or voted for",displayOptions:{show:{operation:["listIdeas"]}}},
      {displayName:"Limit",name:"ideaLimit",type:"number",typeOptions:{minValue:1,maxValue:100},default:30,displayOptions:{show:{operation:["listIdeas"]}}},
      {displayName:"Cursor",name:"ideaCursor",type:"string",default:"",description: 'Next_cursor from the previous page; leave empty for the first page',displayOptions:{show:{operation:["listIdeas"]}}},
      // The artist image: from a binary property or a link.
      // Artist pages and profiles.
      locator("Artist","artistId","searchArtists","an artist",{required:true,displayOptions:{show:{operation:["listArtistProfiles","addArtistProfile","reorderArtistProfiles","updateArtistProfile",
        "removeArtistProfile","discoverArtistProfiles","confirmAllArtistProfiles","getArtistPage","updateArtistPage","previewArtistPage","publishArtistPage","unpublishArtistPage","getArtistPageStats","claimArtistHandle"]}}}),
      locator("Artist","artistId","searchArtists","an artist",{description:"Optional: the artist's own address counts as free, and suggestions come from their name",displayOptions:{show:{operation:["checkHandle"]}}}),
      {displayName:"Link",name:"profileUrl",type:"string",default:"",required:true,placeholder:"https://www.instagram.com/novalane",
        description:"The artist's page on any service (https); the service is recognised from the address",displayOptions:{show:{operation:["addArtistProfile"]}}},
      {displayName:"Service",name:"profilePlatform",type:"string",default:"",placeholder:"bandsintown",description: 'Optional: the service ID when the address alone doesn\'t say it',displayOptions:{show:{operation:["addArtistProfile"]}}},
      {displayName:"Title",name:"profileTitle",type:"string",default:"",placeholder:"Tour dates",description:"Optional: shown on the page instead of the service name",displayOptions:{show:{operation:["addArtistProfile"]}}},
      {displayName:"Profile IDs in Order",name:"profileOrder",type:"string",default:"",required:true,placeholder:"link_…, link_…",
        description: 'Profile IDs, first to last, comma-separated (List Artist Profiles: ID)',displayOptions:{show:{operation:["reorderArtistProfiles"]}}},
      {displayName:"Profile ID",name:"profileId",type:"string",default:"",required:true,description:"From List Artist Profiles",displayOptions:{show:{operation:["updateArtistProfile","removeArtistProfile"]}}},
      {displayName:"Changes",name:"profileChanges",type:"collection",placeholder:"Add Change",default:{},displayOptions:{show:{operation:["updateArtistProfile"]}},
        options:[
          {displayName:"Confirmed",name:"confirmed",type:"boolean",default:true,description:"Whether the user says this found profile is theirs. Never confirm one on their behalf."},
          {displayName:"Link",name:"url",type:"string",default:"",description:"A corrected link: automatic searches leave the profile alone from then on"},
          {displayName:"Position",name:"position",type:"number",typeOptions:{minValue:0},default:0,description:"Its place in the list, from 0"},
          {displayName:"State",name:"state",type:"options",options:[{name:"Shown",value:"shown"},{name:"Hidden",value:"hidden"}],default:"shown",description:"Hidden keeps it off the page"},
          {displayName:"Title",name:"title",type:"string",default:"",description:"Shown instead of the service name; empty removes it"},
        ]},
      {displayName:"Theme",name:"pageTheme",type:"options",options:[{name:"Keep",value:""},{name:"Neon",value:"neon"},{name:"Paper",value:"paper"},{name:"Stage",value:"stage"},{name:"Studio",value:"studio"}],default:"",
        displayOptions:{show:{operation:["updateArtistPage"]}}},
      {displayName:"Genres",name:"pageGenres",type:"string",default:"",placeholder:"Alt-pop, Indie",description:"Up to 5, comma-separated; leave empty to keep them",displayOptions:{show:{operation:["updateArtistPage"]}}},
      {displayName:"Place",name:"pagePlace",type:"string",default:"",placeholder:"Montréal",description:"Where the artist is from; leave empty to keep it",displayOptions:{show:{operation:["updateArtistPage"]}}},
      // eslint-disable-next-line @n8n/community-nodes/open-ended-node-fields -- sections, buttons and social are nested lists the API owns; the common fields are typed above
      {displayName:"More Page Fields (JSON)",name:"pageJson",type:"json",default:"{}",
        description:"Any other draft fields as the API takes them: sections (replaces the whole list, in page order), accent, background, font, buttons, layout, name, photo, social, tracking. Fields set above win.",
        displayOptions:{show:{operation:["updateArtistPage"]}}},
      {displayName:"Days",name:"statsDays",type:"number",typeOptions:{minValue:1,maxValue:365},default:30,description:"The period: up to 30 without the page extras, a year with them",displayOptions:{show:{operation:["getArtistPageStats"]}}},
      {displayName:"Address",name:"handle",type:"string",default:"",required:true,placeholder:"novalane",
        description: 'The page address without kinetune.com/@: 3 to 30 lowercase letters, numbers, . and _.',displayOptions:{show:{operation:["claimArtistHandle","checkHandle"]}}},
      {displayName:"Take From My Profile",name:"takeFromProfile",type:"boolean",default:false,
        description:"Whether to move the address here when it is your own username (Check Page Address: problem yours); your creator profile gets a new username",displayOptions:{show:{operation:["claimArtistHandle"]}}},
      {displayName:"Image From",name:"artistImageSource",type:"options",options:[{name:"Binary Property",value:"binary"},{name:"Link",value:"url"}],default:"binary",displayOptions:{show:{operation:["setArtistImage"]}}},
      {displayName:"Image Binary Property",name:"artistImageBinaryProperty",type:"string",default:"data",required:true,description:"JPEG, PNG or WebP, at least 512 px on its short side, up to 15 MB",displayOptions:{show:{operation:["setArtistImage"],artistImageSource:["binary"]}}},
      {displayName:"Image URL",name:"artistImageUrl",type:"string",default:"",required:true,placeholder:"https://…",displayOptions:{show:{operation:["setArtistImage"],artistImageSource:["url"]}}},
      {displayName:"Crop",name:"pictureCrop",type:"collection",placeholder:"Add Crop Value",default:{},displayOptions:{show:{operation:["setArtistImage"]}},
        description:"The square to keep, in fractions of the image. Leave empty to center it.",
        options:[
          {displayName:"Left (X)",name:"x",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:4},default:0,description:"Left edge as a fraction of the image width"},
          {displayName:"Top (Y)",name:"y",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:4},default:0,description:"Top edge as a fraction of the image height"},
          {displayName:"Size",name:"size",type:"number",typeOptions:{minValue:0.1,maxValue:1,numberPrecision:4},default:1,description:"Side of the square as a fraction of the image's short side"},
        ]},
      // The kit: an artist's outfits, the workspace's places and props.
      // The kit: every piece is in one artist's kit, and serves the others once shared.
      locator("Artist","kitArtistId","searchArtists","an artist",{description:"What this artist's songs can use; leave empty for every piece",displayOptions:{show:{operation:["listKit"]}}}),
      {displayName:"Pieces",name:"kitListScope",type:"options",default:"for",
        options:[{name:"For the Artist's Songs",value:"for",description:"Theirs first, then those other artists shared"},{name:"Only the Artist's Kit",value:"own"}],
        displayOptions:{show:{operation:["listKit"]}}},
      {displayName:"Kind",name:"kitListKind",type:"options",options:[{name:"Any",value:""},{name:"Outfit",value:"outfit"},{name:"Place",value:"place"},{name:"Prop",value:"prop"}],default:"",displayOptions:{show:{operation:["listKit"]}}},
      {displayName:"Search",name:"kitSearch",type:"string",default:"",placeholder:"Part of the name, handle or description",description:"Only pieces whose name, @handle or description contains this",displayOptions:{show:{operation:["listKit"]}}},
      {displayName:"Limit",name:"kitLimit",type:"number",typeOptions:{minValue:0,maxValue:100},default:0,description:"Max number of pieces to return (0: every piece)",displayOptions:{show:{operation:["listKit"]}}},
      {displayName:"Offset",name:"kitOffset",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,description:"How many pieces to skip: add the limit to get the next page",displayOptions:{show:{operation:["listKit"]}}},
      {displayName:"Kind",name:"kitKind",type:"options",options:[{name:"Outfit",value:"outfit",description:"What an artist wears"},{name:"Place",value:"place",description:"Where it happens, best with nobody in it"},{name:"Prop",value:"prop",description:"What they hold, or what stands in the shot"}],default:"prop",displayOptions:{show:{operation:["addKitPiece"]}}},
      locator("Artist","kitArtistId","searchArtists","an artist",{required:true,description:"The artist the outfit is for",displayOptions:{show:{operation:["addKitPiece"],kitKind:["outfit"]}}}),
      locator("Kit Of","kitArtistId","searchArtists","an artist",{description:"The artist whose kit it goes in (empty: the workspace's only artist, else its first, shared)",displayOptions:{show:{operation:["addKitPiece"],kitKind:["place","prop"]}}}),
      {displayName:"Name",name:"kitName",type:"string",default:"",required:true,placeholder:"Chrome mic",displayOptions:{show:{operation:["addKitPiece"]}}},
      {displayName:"Image From",name:"kitSource",type:"options",options:[{name:"Binary Property",value:"binary"},{name:"Link",value:"url"},{name:"Stock Photo",value:"stock",description:"From Search Stock, credited"}],default:"binary",displayOptions:{show:{operation:["addKitPiece"]}}},
      {displayName:"Image Binary Property",name:"kitBinaryProperty",type:"string",default:"data",required:true,description:"JPEG, PNG or WebP, at least 512 px on its short side",displayOptions:{show:{operation:["addKitPiece"],kitSource:["binary"]}}},
      {displayName:"Image URL",name:"kitFileUrl",type:"string",default:"",required:true,placeholder:"https://…",displayOptions:{show:{operation:["addKitPiece"],kitSource:["url"]}}},
      {displayName:"Stock Photo ID",name:"kitStockId",type:"string",default:"",required:true,displayOptions:{show:{operation:["addKitPiece"],kitSource:["stock"]}}},
      {displayName:"I Have the Rights to This Image",name:"kitRights",type:"boolean",default:false,required:true,displayOptions:{show:{operation:["addKitPiece"],kitSource:["binary","url"]}}},
      {displayName:"Kit Piece ID",name:"kitId",type:"string",default:"",required:true,placeholder:"kit_…",displayOptions:{show:{operation:["getKitPiece","updateKitPiece","deleteKitPiece","drawPlaceAngles"]}}},
      {displayName:"Angles",name:"kitAngles",type:"multiOptions",default:["three-quarter","side","low"],
        options:[{name:"Corner",value:"corner",description:"From a far corner, on the diagonal"},{name:"Detail",value:"detail",description:"Close on one object or texture"},
          {name:"Framed",value:"framed",description:"Through a doorway or something near"},{name:"High",value:"high",description:"From up high, looking down"},
          {name:"Low",value:"low",description:"Near the floor, looking up"},{name:"Overhead",value:"overhead",description:"Straight down from above"},
          {name:"Reverse",value:"reverse",description:"Turned round, facing the other way"},{name:"Side",value:"side",description:"Across it, in profile"},
          {name:"Three-Quarter",value:"three-quarter",description:"Round to one side, in depth"},{name:"Wide",value:"wide",description:"The whole set, pulled far back"}],
        description:"Which angles of the place to draw, one or more (each is one picture, priced in credits)",displayOptions:{show:{operation:["drawPlaceAngles"]}}},
      {displayName:"Draw Them",name:"kitAnglesConfirm",type:"boolean",default:false,
        description:"Whether to draw them now (spends credits); off, only the price is returned",displayOptions:{show:{operation:["drawPlaceAngles"]}}},
      {displayName:"Credits",name:"kitAnglesCredits",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,
        description:"The price shown (credits); another price is refused with the current one. 0: don't check it.",displayOptions:{show:{operation:["drawPlaceAngles"],kitAnglesConfirm:[true]}}},
      {displayName:"Keep (A Pending Piece)",name:"kitKeep",type:"boolean",default:false,
        description:"Whether to keep a pending piece in the kit: a place's new angle, or a picture drawn for a shot list (to leave it out, delete it)",displayOptions:{show:{operation:["updateKitPiece"]}}},
      {displayName:"New Name",name:"kitName",type:"string",default:"",description:"Leave empty to keep the name",displayOptions:{show:{operation:["updateKitPiece"]}}},
      {displayName:"Sharing",name:"kitSharing",type:"options",default:"",
        options:[{name:"Keep As It Is",value:""},{name:"Share With All Artists",value:"shared"},{name:"Only Its Own Artist",value:"own"}],
        description:"Whether every other artist's songs can use it too",displayOptions:{show:{operation:["updateKitPiece"]}}},
      {displayName:"Handle",name:"kitHandle",type:"string",default:"",placeholder:"chrome-mic",description:"How a direction mentions it, without the @ (default: from the name)",displayOptions:{show:{operation:["addKitPiece","updateKitPiece"]}}},
      {displayName:"Description",name:"kitDescription",type:"string",default:"",description:"What it is, for the director (a stock photo's caption by default)",displayOptions:{show:{operation:["addKitPiece","updateKitPiece"]}}},
      {displayName:"Crop",name:"kitCrop",type:"collection",placeholder:"Add Crop Value",default:{},displayOptions:{show:{operation:["addKitPiece","updateKitPiece"]}},
        description:"The rectangle to keep, in fractions of the image (a prop cut out of a bigger photo). Leave empty for the whole image.",
        options:[
          {displayName:"Left (X)",name:"x",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:4},default:0},
          {displayName:"Top (Y)",name:"y",type:"number",typeOptions:{minValue:0,maxValue:1,numberPrecision:4},default:0},
          {displayName:"Width",name:"w",type:"number",typeOptions:{minValue:0.02,maxValue:1,numberPrecision:4},default:1},
          {displayName:"Height",name:"h",type:"number",typeOptions:{minValue:0.02,maxValue:1,numberPrecision:4},default:1},
        ]},
      // The casting: its people kept, changed or swapped, drawn for the credits shown.
      {displayName:"Casting ID",name:"castingId",type:"string",default:"",required:true,placeholder:"casting_…",displayOptions:{show:{operation:["getCasting","drawCast","deleteCasting"]}}},
      {displayName:"People to Keep",name:"castPeople",type:"fixedCollection",typeOptions:{multipleValues:true},default:{},placeholder:"Keep a person",
        description: 'The people kept, by their number (people[].index); the others are left out. None: keep it to the artist.',displayOptions:{show:{operation:["drawCast"]}},
        options:[{name:"person",displayName:"Person",values:[{displayName:"Number",name:"index",type:"number",typeOptions:{minValue:1,maxValue:3,numberPrecision:0},default:1},
          {displayName:"Name",name:"name",type:"string",default:"",description:"Optional: another first name"},
          {displayName:"Description",name:"description",type:"string",typeOptions:{rows:3},default:"",description:"Optional: how they look, edited (a made-up adult, never a real or famous person)"},
          {displayName:"Kit Character Instead (Handle)",name:"character",type:"string",default:"",placeholder:"mia-torres",description:"Optional: a character from the kit (List Characters) in this part instead, free"}]}]},
      {displayName:"Credits",name:"castCredits",type:"number",typeOptions:{minValue:0,numberPrecision:0},default:0,
        description:"The price shown: price.per_person × the people drawn (0 when nobody is drawn); another price is refused with the current one",displayOptions:{show:{operation:["drawCast"]}}},
      locator("Song","analysisSongId","searchSongs","a song",{required:true,displayOptions:{show:{operation:["songAnalysis","getSong","renameSong","setSongCover","listSongCovers","useCover","deleteCover","downloadSongCover","downloadSongAudio","archiveSong","reanalyzeSong","setSongLyrics","clearSongLyrics","setSongWords","transcribeSong","editSongBrief","rewriteSongBrief","listMusicVideoDrafts","getSongDraft","getVideoDraft","editVideoDraft"]}}}),
      {displayName:"Song Title",name:"songTitle",type:"string",default:"",description:"Leave empty to use the file's title tag, then its file name",displayOptions:{show:{operation:["createSong"]}}},
      // A song brief's correction: the fields filled in replace the brief's; the others stay.
      {displayName:"About",name:"briefTheme",type:"string",typeOptions:{rows:2},default:"",description: 'What the song is about, in a sentence. Empty: unchanged.',displayOptions:{show:{operation:["editSongBrief"]}}},
      {displayName:"Story",name:"briefStory",type:"string",typeOptions:{rows:3},default:"",description: 'The story or situation under the words. Empty: unchanged.',displayOptions:{show:{operation:["editSongBrief"]}}},
      {displayName:"Tone",name:"briefTone",type:"string",default:"",placeholder:"tender, wistful",description: 'Its register, in a few words. Empty: unchanged.',displayOptions:{show:{operation:["editSongBrief"]}}},
      {displayName:"Setting",name:"briefSetting",type:"string",default:"",description: 'An era, a place or a scene it evokes. Empty: unchanged.',displayOptions:{show:{operation:["editSongBrief"]}}},
      {displayName:"How It Moves",name:"briefMoodArc",type:"fixedCollection",typeOptions:{multipleValues:true},default:{},placeholder:"Add a section",
        description: 'The feeling section by section; replaces the whole list. None: unchanged.',displayOptions:{show:{operation:["editSongBrief"]}},
        options:[{name:"section",displayName:"Section",values:[{displayName:"Section",name:"section",type:"string",default:"",placeholder:"Chorus 1"},
          {displayName:"Feeling",name:"feeling",type:"string",default:"",placeholder:"the hurt breaks through"}]}]},
      {displayName:"Lyrics Language",name:"language",type:"string",default:"",placeholder:"en",description:"ISO 639-1 code; leave empty to detect automatically",displayOptions:{show:{operation:["createSong"]}}},
      {displayName:"Credits",name:"transcribeCredits",type:"number",default:0,typeOptions:{minValue:0},
        description:"The price you agreed to (0: read the price and stop without transcribing, so you can check it first)",displayOptions:{show:{operation:["transcribeSong"]}}},
      {displayName:"Language",name:"transcribeLanguage",type:"string",default:"",placeholder:"fr",description:"The language it is sung in, when the words came out in the wrong one",
        displayOptions:{show:{operation:["transcribeSong"]}}},
      {displayName:"Kind",name:"draftType",type:"options",options:[{name:"Lyric Video",value:"lyric-video"},{name:"Canvas",value:"canvas"}],default:"lyric-video",
        description:"Which of the song's drafts",displayOptions:{show:{operation:["getVideoDraft","editVideoDraft"]}}},
      {displayName:"Changes (JSON)",name:"draftChanges",type:"json",default:"{\n  \"shuffle\": true\n}",required:true,
        description:"What changes, as Change Video Draft takes it: shuffle, replace [{cut, clip_id}], joins [{cut, transition}], starts, sources {moods, folders}, density, transitions, grade, grade_amount, effects, shape, fill, speed, look_id, lyric_style, format, trim; a Canvas: picture, loop, seconds, cut, motion, light, atmosphere, frame",
        displayOptions:{show:{operation:["editVideoDraft"]}}},
      {displayName:"Words",name:"songWords",type:"json",default:"[]",required:true,
        description: 'Every word of the song in order, as Get Song Analysis returns them (words), each {text, start, end} in seconds and line: true on the first word of a line. Saved as sent; videos made from then on use them.',
        displayOptions:{show:{operation:["setSongWords"]}}},
      {displayName:"Lyrics",name:"lyrics",type:"string",typeOptions:{rows:8},default:"",placeholder:"[Verse 1]\nI've been running through the static…",
        description:"The song's lyrics as text (Suno-style [Verse]/[Chorus] tags are fine and set the song's sections), or an SRT, WebVTT or LRC file's contents. Every word is still timed from the audio: your text fixes misheard words and sets where lines break. Optional when creating a song.",
        displayOptions:{show:{operation:["createSong","setSongLyrics"]}}},
      {displayName:"Instrumental (Deprecated)",name:"instrumental",type:"options",default:"",description:"Deprecated: the analysis hears whether a song has vocals. Yes still skips transcription (no words, no lip-sync). Stops working on 2027-04-30.",
        options:[{name:"As Is",value:""},{name:"Yes, Instrumental",value:"true"},{name:"No, It Has Vocals",value:"false"}],displayOptions:{show:{operation:["createSong","renameSong"]}}},
      {displayName:"Binary Property",name:"uploadBinaryProperty",type:"string",default:"data",required:true,
        description:"The file to send: MP3, WAV, M4A, JPEG, PNG, WebP, MP4, MOV or WebM",displayOptions:{show:{operation:["createUpload"]}}},
      {displayName:"Audio Binary Property",name:"audioBinaryProperty",type:"string",default:"audio",required:true,displayOptions:{show:{operation:["createSong","addSongImportAudio"]}}},
      {displayName:"Cover Binary Property",name:"coverBinaryProperty",type:"string",default:"cover",description: 'Optional: square JPEG or PNG, 1000–6000 px. Leave empty to add the song without cover art (Change Song Cover adds one later).',displayOptions:{show:{operation:["createSong"]}}},
      {displayName:"Cover From",name:"coverSource",type:"options",options:[{name:"Binary Property",value:"binary"},{name:"Link",value:"url"}],default:"binary",displayOptions:{show:{operation:["setSongCover"]}}},
      {displayName:"Cover Binary Property",name:"newCoverBinaryProperty",type:"string",default:"cover",required:true,description:"Square JPEG or PNG, 1000–6000 px, up to 20 MB",displayOptions:{show:{operation:["setSongCover"],coverSource:["binary"]}}},
      {displayName:"Cover URL",name:"coverUrl",type:"string",default:"",required:true,placeholder:"https://…",displayOptions:{show:{operation:["setSongCover"],coverSource:["url"]}}},
      // Cover art Kinetune makes: price, make, follow, redraw; then use or delete the song's covers.
      locator("Song","songId","searchReadySongs","a song",{required:true,description:"An analysed song (status ready); the list shows only those",displayOptions:{show:{operation:["makeCovers"]}}}),
      {displayName:"Covers",name:"coverCount",type:"number",typeOptions:{minValue:1,maxValue:4,numberPrecision:0},default:1,description:"How many covers, each a different idea (1 to 4)",displayOptions:{show:{operation:["quoteCovers","makeCovers"]}}},
      {displayName:"Style",name:"coverStyle",type:"options",options:COVER_STYLES,default:"auto",description:"How the cover is made",displayOptions:{show:{operation:["makeCovers"]}}},
      {displayName:"Vibes",name:"coverVibes",type:"multiOptions",options:COVER_VIBES,default:[],description:"Up to two moods or worlds; none: the song decides",displayOptions:{show:{operation:["makeCovers"]}}},
      {displayName:"Artist on It",name:"coverArtist",type:"options",options:COVER_ARTIST,default:"auto",displayOptions:{show:{operation:["makeCovers"]}}},
      {displayName:"Idea",name:"coverIdea",type:"string",typeOptions:{rows:3},default:"",placeholder:"A motel pool at night, the water lit from below",description:"Optional: your idea, in your words (up to 500 characters)",displayOptions:{show:{operation:["makeCovers"]}}},
      {displayName:"Words",name:"coverWords",type:"options",options:COVER_WORDS,default:"none",description:"Words on the cover, spelled exactly as the song (the Type style needs some)",displayOptions:{show:{operation:["makeCovers"]}}},
      {displayName:"Round ID",name:"coverRequestId",type:"string",default:"",required:true,placeholder:"coverreq_…",displayOptions:{show:{operation:["getCoverRequest","redrawCover"]}}},
      {displayName:"Cover ID",name:"coverId",type:"string",default:"",required:true,placeholder:"cover_…",displayOptions:{show:{operation:["redrawCover","useCover","deleteCover"]}}},
      {displayName:"Note",name:"coverNote",type:"string",typeOptions:{rows:2},default:"",required:true,placeholder:"Warmer, the moon bigger",description:"What to change, in your words (up to 500 characters)",displayOptions:{show:{operation:["redrawCover"]}}},
      {displayName:"Credits",name:"coverCredits",type:"number",typeOptions:{minValue:1,numberPrecision:0},default:0,required:true,
        description:"The price Price Covers shows (credits for Make Covers with the same count, redraw_credits for Redraw Cover); another price is refused with the current one",displayOptions:{show:{operation:["makeCovers","redrawCover"]}}},
    ],
		usableAsTool: true,
  };

  methods={listSearch:{searchArtists,searchSongs,searchReadySongs}};

  async execute(this:IExecuteFunctions):Promise<INodeExecutionData[][]>{
    const items=this.getInputData();const out:INodeExecutionData[]=[];
    // A required id for the request path (also from the artist and song pickers).
    const LABELS:Record<string,string>={draftId:"Draft ID",clipId:"Clip ID",clipMoodId:"Collection ID",clipFolderId:"Folder ID",canvasPresetId:"Preset ID",fromLookId:"From Look ID",artistId:"Artist",analysisSongId:"Song",songId:"Song",coverRequestId:"Round ID",coverId:"Cover ID",videoId:"Video ID",lookId:"Look ID",planId:"Plan ID",kitId:"Kit Piece ID",castingId:"Casting ID"};
    const required=(name:string,i:number)=>{
      const value=locatorValue(this,name,i);
      if(!value)throw new NodeOperationError(this.getNode(),(LABELS[name]??name)+" is required",{itemIndex:i});
      return value;
    };
    const id=(name:string,i:number)=>encodeURIComponent(required(name,i));
    // ?q= &limit= &offset= of the music lists, plus their filters.
    const listQuery=(i:number,filters:Record<string,string>={})=>{
      const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v));
      const q=String(this.getNodeParameter("search",i,"")||"").trim();if(q)query.set("q",q);
      query.set("limit",String(this.getNodeParameter("listLimit",i,50)));
      const offset=Math.trunc(Number(this.getNodeParameter("listOffset",i,0))||0);if(offset>0)query.set("offset",String(offset));
      return "?"+query.toString();
    };
    for(let i=0;i<items.length;i++){
      try{
        const operation=String(this.getNodeParameter("operation",i));
        let result:Json={};
        if(operation==="quote")result=await api.call(this,"POST","/api/v1/quotes",generationRequest(this,i));
        else if(operation==="create")result=await api.call(this,"POST","/api/v1/videos",{...generationRequest(this,i),quote_id:String(this.getNodeParameter("quoteId",i))});
        else if(operation==="planMusicVideo")result=await api.call(this,"POST","/api/v1/music-video-plans",musicVideoPlanRequest(this,i));
        else if(operation==="getMusicVideoPlan")result=await api.call(this,"GET","/api/v1/music-video-plans/"+id("planId",i));
        else if(operation==="getMusicVideoPlanWrite")result=await api.call(this,"GET","/api/v1/music-video-plan-writes/"+id("writeId",i));
        else if(operation==="deleteMusicVideoPlan"){await api.call(this,"DELETE","/api/v1/music-video-plans/"+id("planId",i));result={deleted:true};}
        else if(operation==="checkMusicVideoModel")result=await api.call(this,"GET",`/api/v1/music-video-plans/${id("planId",i)}/model?model=${encodeURIComponent(String(this.getNodeParameter("switchModel",i,"")))}`);
        else if(operation==="switchMusicVideoModel")result=await api.call(this,"POST",`/api/v1/music-video-plans/${id("planId",i)}/model`,{model:String(this.getNodeParameter("switchModel",i,""))});
        else if(operation==="swapMusicVideoPlace")result=await api.call(this,"PATCH",`/api/v1/music-video-plans/${id("planId",i)}/places/${Number(this.getNodeParameter("place",i,1))}`,{stock_id:String(this.getNodeParameter("stockId",i,"")).trim()});
        else if(operation==="listMusicVideoVersions")result=await api.call(this,"GET",`/api/v1/music-video-plans/${id("planId",i)}/versions`);
        else if(operation==="deleteMusicVideoVersion")result=await api.call(this,"DELETE",`/api/v1/music-video-plans/${id("planId",i)}/versions/${id("versionId",i)}`);
        else if(operation==="listMusicVideoPictures")result=await api.call(this,"GET",`/api/v1/music-video-plans/${id("planId",i)}/pictures`);
        else if(operation==="drawMusicVideoPictures"){
          const pictures=String(this.getNodeParameter("planPictures",i,"")).split(",").map(k=>k.trim()).filter(Boolean);
          const redraw=Boolean(this.getNodeParameter("picturesRedraw",i,false)),confirm=Boolean(this.getNodeParameter("picturesConfirm",i,false));
          if(redraw&&!pictures.length)throw new NodeOperationError(this.getNode(),"Name the pictures to draw again",{itemIndex:i});
          result=await api.call(this,"POST",`/api/v1/music-video-plans/${id("planId",i)}/pictures`,{...(pictures.length?{pictures}:{}),...(redraw?{redraw:true}:{}),
            ...(confirm?{confirm:true,credits:Number(this.getNodeParameter("picturesCredits",i,0))}:{})});
        }
        else if(operation==="dropMusicVideoAngle")result=await api.call(this,"DELETE",`/api/v1/music-video-plans/${id("planId",i)}/angles/${Number(this.getNodeParameter("anglePlace",i,1))}`);
        else if(operation==="listMusicVideoFrames")result=await api.call(this,"GET",`/api/v1/music-video-plans/${id("planId",i)}/frames`);
        else if(operation==="drawMusicVideoFrame"){
          const all=Boolean(this.getNodeParameter("frameAll",i,false));
          const shots=String(this.getNodeParameter("frameShots",i,"")||"").split(",").map(v=>Number(v.trim())).filter(n=>Number.isInteger(n)&&n>0);
          if(all&&!shots.length)throw new NodeOperationError(this.getNode(),"Draw All needs the shots from List Opening Frames (batch_shots)",{itemIndex:i});
          result=await api.call(this,"POST",`/api/v1/music-video-plans/${id("planId",i)}/frames`,
            all?{all:true,shots,credits:Number(this.getNodeParameter("frameCredits",i))}:{shot:Number(this.getNodeParameter("frameShot",i,1)),credits:Number(this.getNodeParameter("frameCredits",i))});
        }
        else if(operation==="getMusicVideoStoryboard")result=await api.call(this,"GET",`/api/v1/music-video-plans/${id("planId",i)}/storyboard`);
        else if(operation==="getVideoDraft")result=await api.call(this,"GET",`/api/v1/songs/${id("analysisSongId",i)}/video-draft?type=${encodeURIComponent(String(this.getNodeParameter("draftType",i,"lyric-video")))}`);
        else if(operation==="editVideoDraft"){
          const raw=this.getNodeParameter("draftChanges",i,"{}");
          let changes:unknown;try{changes=typeof raw==="string"?JSON.parse(raw):raw;}catch{throw new NodeOperationError(this.getNode(),"Changes must be JSON, e.g. {\"shuffle\": true}",{itemIndex:i});}
          if(!changes||typeof changes!=="object"||Array.isArray(changes))throw new NodeOperationError(this.getNode(),"Changes must be a JSON object",{itemIndex:i});
          result=await api.call(this,"PATCH",`/api/v1/songs/${id("analysisSongId",i)}/video-draft`,{...changes as Record<string,unknown>,type:String(this.getNodeParameter("draftType",i,"lyric-video"))});
        }
        else if(operation==="saveMusicVideoLook")result=await api.call(this,"POST","/api/v1/videos/"+id("videoId",i)+"/look");
        else if(operation==="listMusicVideoLooks")result=await api.call(this,"GET","/api/v1/music-video-looks?scope="+encodeURIComponent(String(this.getNodeParameter("musicVideoLookScope",i,"all"))));
        else if(operation==="getMusicVideoLook")result=await api.call(this,"GET","/api/v1/music-video-looks/"+id("musicVideoLookId",i));
        else if(operation==="deleteMusicVideoLook")result=await api.call(this,"DELETE","/api/v1/music-video-looks/"+id("musicVideoLookId",i));
        else if(operation==="listMusicVideoDrafts")result=await api.call(this,"GET","/api/v1/music-video-plans?song_id="+id("analysisSongId",i));
        else if(operation==="reviseMusicVideoShot")result=await api.call(this,"POST","/api/v1/videos/"+id("videoId",i)+"/revisions",revisionRequest(this,i));
        else if(operation==="priceMusicVideoRevision")result=await api.call(this,"GET","/api/v1/videos/"+id("videoId",i)+"/revisions");
        else if(operation==="get")result=await api.call(this,"GET","/api/v1/videos/"+id("videoId",i));
        else if(operation==="listVideos"){
          const query=new URLSearchParams({limit:String(this.getNodeParameter("listLimit",i,50))});
          const songId=locatorValue(this,"listSongId",i);const artistId=locatorValue(this,"listArtistId",i);const type=String(this.getNodeParameter("listType",i,"")||"");
          const q=String(this.getNodeParameter("search",i,"")||"").trim();const cursor=String(this.getNodeParameter("listCursor",i,"")||"").trim();
          const quoteId=String(this.getNodeParameter("listQuoteId",i,"")||"").trim();
          if(songId)query.set("song_id",songId);if(artistId)query.set("artist_id",artistId);if(type)query.set("type",type);if(quoteId)query.set("quote_id",quoteId);if(q)query.set("q",q);if(cursor)query.set("cursor",cursor);
          result=await api.call(this,"GET","/api/v1/videos?"+query.toString());
        }
        else if(operation==="cancel")result=await api.call(this,"POST","/api/v1/videos/"+id("videoId",i)+"/cancel");
        else if(operation==="retry")result=await api.call(this,"POST","/api/v1/videos/"+id("videoId",i)+"/retry");
        else if(operation==="listLooks"){
          const category=String(this.getNodeParameter("category",i,"")||"");
          const lyricStyle=String(this.getNodeParameter("lookLyricStyle",i,"")||"");const artistId=locatorValue(this,"artistId",i);
          result=await api.call(this,"GET","/api/v1/looks?limit=100&scope="+String(this.getNodeParameter("scope",i,"all"))+(category?"&category="+encodeURIComponent(category):"")
            +(lyricStyle?"&lyric_style="+encodeURIComponent(lyricStyle):"")+(artistId?"&artist_id="+encodeURIComponent(artistId):""));
        }
        else if(operation==="getLook")result=await api.call(this,"GET","/api/v1/looks/"+id("lookId",i));
        else if(operation==="getLookClips")result=await api.call(this,"GET","/api/v1/looks/"+id("lookId",i)+"/clips");
        else if(operation==="setVisibility")result=await api.call(this,"POST","/api/v1/looks/"+id("lookId",i)+"/visibility",{visibility:String(this.getNodeParameter("visibility",i))});
        else if(operation==="options")result=await api.call(this,"GET","/api/v1/options");
        else if(operation==="listArtists")result=await api.call(this,"GET","/api/v1/artists"+listQuery(i));
        else if(operation==="createArtist")result=await api.call(this,"POST","/api/v1/artists",{name:String(this.getNodeParameter("artistName",i))});
        else if(operation==="songAnalysis")result=await api.call(this,"GET","/api/v1/songs/"+id("analysisSongId",i)+"/analysis?min_seconds="+Number(this.getNodeParameter("partsFor",i,8)));
        else if(operation==="listSongs"){
          const sort=String(this.getNodeParameter("songSort",i,"title")||"title");
          result=await api.call(this,"GET","/api/v1/songs"+listQuery(i,{artist_id:locatorValue(this,"artistId",i),
            status:String(this.getNodeParameter("songStatus",i,"")||""),sort:sort==="title"?"":sort,include:this.getNodeParameter("includeVideos",i,false)?"videos":""}));
        }
        else if(operation==="createSong"){
          const artistId=locatorValue(this,"artistId",i);const title=String(this.getNodeParameter("songTitle",i));
          const language=String(this.getNodeParameter("language",i,"")||"").trim();
          const audioProperty=String(this.getNodeParameter("audioBinaryProperty",i));
          // The cover is optional: an empty property adds the song without one; a named one must be there.
          const coverProperty=String(this.getNodeParameter("coverBinaryProperty",i,"")||"").trim();
          const audio=items[i].binary?.[audioProperty];const cover=coverProperty?items[i].binary?.[coverProperty]:undefined;
          if(!audio)throw new NodeOperationError(this.getNode(),"Audio binary property '"+audioProperty+"' was not found",{itemIndex:i});
          if(coverProperty&&!cover)throw new NodeOperationError(this.getNode(),"Cover binary property '"+coverProperty+"' was not found (leave it empty to add the song without cover art)",{itemIndex:i});
          const [audioBuffer,coverBuffer]=await Promise.all([this.helpers.getBinaryDataBuffer(i,audioProperty),cover?this.helpers.getBinaryDataBuffer(i,coverProperty):Promise.resolve(null)]);
          const base=await baseUrl(this);
          const lyrics=String(this.getNodeParameter("lyrics",i,"")||"").trim();
          const form=new FormData();if(artistId)form.set("artist_id",artistId);if(title.trim())form.set("title",title.trim());if(language)form.set("language",language);if(lyrics)form.set("lyrics",lyrics);
          if(String(this.getNodeParameter("instrumental",i,""))==="true")form.set("instrumental","true");
          form.set("audio",new Blob([new Uint8Array(audioBuffer)],{type:audio.mimeType||"application/octet-stream"}),audio.fileName||"audio.mp3");
          if(cover&&coverBuffer)form.set("cover_art",new Blob([new Uint8Array(coverBuffer)],{type:cover.mimeType||"application/octet-stream"}),cover.fileName||"cover.jpg");
          result=await this.helpers.httpRequestWithAuthentication.call(this,"kinetuneApi",{method:"POST",url:base+"/api/v1/songs",body:form});
        }
        else if(operation==="createUpload"){
          // A signed upload: the file is sent to it here, and its file_url goes in any *_url field.
          const property=String(this.getNodeParameter("uploadBinaryProperty",i,"data"));const file=items[i].binary?.[property];
          if(!file)throw new NodeOperationError(this.getNode(),"Binary property '"+property+"' was not found",{itemIndex:i});
          const bytes=await this.helpers.getBinaryDataBuffer(i,property);
          const upload=await api.call(this,"POST","/api/v1/uploads",{filename:file.fileName||"file",content_type:file.mimeType,size_bytes:bytes.length}) as {upload_url:string;headers:Record<string,string>;file_url:string};
          await this.helpers.httpRequest({method:"PUT",url:upload.upload_url,headers:upload.headers,body:bytes});
          result=upload;
        }
        else if(operation==="getAccount")result=await api.call(this,"GET","/api/v1/account");
        else if(operation==="listOrganizations")result=await api.call(this,"GET","/api/v1/organizations");
        else if(operation==="createOrganization")result=await api.call(this,"POST","/api/v1/organizations",{name:String(this.getNodeParameter("organizationName",i)).trim(),type:String(this.getNodeParameter("organizationType",i))});
        else if(operation==="updateOrganization"){
          const name=String(this.getNodeParameter("organizationNewName",i,"")||"").trim();const type=String(this.getNodeParameter("organizationNewType",i,"")||"");
          if(!name&&!type)throw new NodeOperationError(this.getNode(),"Set a new name, a type, or both",{itemIndex:i});
          result=await api.call(this,"PATCH","/api/v1/organization",{...(name?{name}:{}),...(type?{type}:{})});
        }
        else if(operation==="searchStock"){
          const kind=String(this.getNodeParameter("stockKind",i,"photo"));const seconds=Number(this.getNodeParameter("stockSeconds",i,0)||0);
          const query=new URLSearchParams({kind,q:String(this.getNodeParameter("stockQuery",i,"")).trim(),orientation:String(this.getNodeParameter("stockOrientation",i,"portrait")),
            page:String(this.getNodeParameter("stockPage",i,1)||1)});
          if(kind==="video"&&seconds>0)query.set("seconds",String(seconds));
          result=await api.call(this,"GET","/api/v1/stock?"+query.toString());
        }
        else if(operation==="listVideoDrafts")result=await api.call(this,"GET","/api/v1/video-drafts");
        else if(operation==="deleteVideoDrafts"){
          const query=this.getNodeParameter("draftScope",i,"one")==="all"
            ?new URLSearchParams(Object.entries({all:"true",song_id:String(this.getNodeParameter("draftSongId",i,"")).trim(),type:String(this.getNodeParameter("draftType",i,""))}).filter(([,v])=>v))
            :new URLSearchParams({id:required("draftId",i)});
          result=await api.call(this,"DELETE","/api/v1/video-drafts?"+query.toString());
        }
        else if(operation==="deleteVideo"){await api.call(this,"DELETE","/api/v1/videos/"+id("videoId",i));result={deleted:true};}
        else if(operation==="shareVideo"){
          const socials=Boolean(this.getNodeParameter("shareSocials",i,false));const handle=socials?String(this.getNodeParameter("shareCreditHandle",i,"")).trim():"";
          result=await api.call(this,"POST","/api/v1/videos/"+id("videoId",i)+"/share",{socials,...(handle?{credit_handle:handle}:{}),
            ...(this.getNodeParameter("shareRightsConfirmed",i,false)?{rights_confirmed:true}:{})});
        }
        else if(operation==="unshareVideo")result=await api.call(this,"DELETE","/api/v1/videos/"+id("videoId",i)+"/share");
        else if(operation==="renameLook")result=await api.call(this,"PATCH","/api/v1/looks/"+id("lookId",i),{name:String(this.getNodeParameter("newName",i))});
        else if(operation==="deleteLook"){await api.call(this,"DELETE","/api/v1/looks/"+id("lookId",i));result={deleted:true};}
        else if(operation==="getArtist")result=await api.call(this,"GET","/api/v1/artists/"+id("artistId",i));
        else if(operation==="renameArtist")result=await api.call(this,"PATCH","/api/v1/artists/"+id("artistId",i),{name:String(this.getNodeParameter("newName",i))});
        else if(operation==="findArtistInCatalog")result=await api.call(this,"GET","/api/v1/catalog/artists?q="+encodeURIComponent(String(this.getNodeParameter("catalogQuery",i)).trim()));
        else if(operation==="linkArtist")result=await api.call(this,"POST","/api/v1/artists/"+id("artistId",i)+"/catalog",{catalog_artist_id:String(this.getNodeParameter("catalogArtistId",i)).trim(),catalog_confirmed:this.getNodeParameter("catalogConfirmed",i)===true});
        else if(operation==="listReleasedSongs"){
          const q=String(this.getNodeParameter("releasedQuery",i,"")||"").trim();
          result=await api.call(this,"GET","/api/v1/artists/"+id("artistId",i)+"/releases"+(q?"?q="+encodeURIComponent(q):""));
        }
        else if(operation==="importSongs"){
          const trackIds=String(this.getNodeParameter("trackIds",i)).split(/[\s,]+/).map(t=>t.trim()).filter(Boolean);
          result=await api.call(this,"POST","/api/v1/song-imports",{artist_id:id("artistId",i),track_ids:trackIds});
        }
        else if(operation==="listSongImports"){
          const status=String(this.getNodeParameter("importStatus",i,"")||"");
          result=await api.call(this,"GET","/api/v1/song-imports"+(status?"?status="+status:""));
        }
        else if(operation==="getSongImport")result=await api.call(this,"GET","/api/v1/song-imports/"+encodeURIComponent(String(this.getNodeParameter("importId",i)).trim()));
        else if(operation==="cancelSongImport")result=await api.call(this,"DELETE","/api/v1/song-imports/"+encodeURIComponent(String(this.getNodeParameter("importId",i)).trim()));
        else if(operation==="addSongImportAudio"){
          const audioProperty=String(this.getNodeParameter("audioBinaryProperty",i));const audio=items[i].binary?.[audioProperty];
          if(!audio)throw new NodeOperationError(this.getNode(),"Audio binary property '"+audioProperty+"' was not found",{itemIndex:i});
          const form=new FormData();
          form.set("audio",new Blob([new Uint8Array(await this.helpers.getBinaryDataBuffer(i,audioProperty))],{type:audio.mimeType||"application/octet-stream"}),audio.fileName||"audio.mp3");
          result=await this.helpers.httpRequestWithAuthentication.call(this,"kinetuneApi",{method:"POST",
            url:(await baseUrl(this))+"/api/v1/song-imports/"+encodeURIComponent(String(this.getNodeParameter("importId",i)).trim())+"/audio",body:form});
        }
        else if(operation==="archiveArtist"){await api.call(this,"DELETE","/api/v1/artists/"+id("artistId",i));result={archived:true};}
        else if(operation==="getSong")result=await api.call(this,"GET","/api/v1/songs/"+id("analysisSongId",i));
        else if(operation==="renameSong"){
          const instrumental=String(this.getNodeParameter("instrumental",i,""));
          result=await api.call(this,"PATCH","/api/v1/songs/"+id("analysisSongId",i),{title:String(this.getNodeParameter("newName",i)),...(instrumental?{instrumental:instrumental==="true"}:{})});
        }
        else if(operation==="setSongCover"){
          const path="/api/v1/songs/"+id("analysisSongId",i)+"/cover";
          if(String(this.getNodeParameter("coverSource",i,"binary"))==="url"){
            const url=String(this.getNodeParameter("coverUrl",i,"")||"").trim();
            if(!url)throw new NodeOperationError(this.getNode(),"Cover URL is required",{itemIndex:i});
            result=await api.call(this,"POST",path,{cover_art_url:url});
          }else{
            const property=String(this.getNodeParameter("newCoverBinaryProperty",i,"cover")).trim();const cover=items[i].binary?.[property];
            if(!cover)throw new NodeOperationError(this.getNode(),"Binary property '"+property+"' was not found",{itemIndex:i});
            const form=new FormData();
            form.set("cover_art",new Blob([new Uint8Array(await this.helpers.getBinaryDataBuffer(i,property))],{type:cover.mimeType||"image/jpeg"}),cover.fileName||"cover.jpg");
            result=await this.helpers.httpRequestWithAuthentication.call(this,"kinetuneApi",{method:"POST",url:await baseUrl(this)+path,body:form});
          }
        }
        else if(operation==="quoteCovers")result=await api.call(this,"GET","/api/v1/cover-requests/quote?count="+Math.trunc(Number(this.getNodeParameter("coverCount",i,1))||1));
        else if(operation==="makeCovers"){
          const songId=required("songId",i);const credits=Number(this.getNodeParameter("coverCredits",i,0));
          const vibes=this.getNodeParameter("coverVibes",i,[]) as string[];const words=String(this.getNodeParameter("coverWords",i,"none"));
          const style=String(this.getNodeParameter("coverStyle",i,"auto"));const idea=String(this.getNodeParameter("coverIdea",i,"")||"").trim();
          if(!(credits>0))throw new NodeOperationError(this.getNode(),"Credits: the price Price Covers shows for this count",{itemIndex:i});
          if(vibes.length>2)throw new NodeOperationError(this.getNode(),"Up to two vibes",{itemIndex:i});
          if(style==="type"&&words==="none")throw new NodeOperationError(this.getNode(),"The Type style needs words: Title, or Artist and Title",{itemIndex:i});
          result=await api.call(this,"POST","/api/v1/cover-requests",{song_id:songId,count:Math.trunc(Number(this.getNodeParameter("coverCount",i,1))||1),style,
            ...(vibes.length?{vibes}:{}),artist:String(this.getNodeParameter("coverArtist",i,"auto")),...(idea?{idea}:{}),words,credits});
        }
        else if(operation==="getCoverRequest")result=await api.call(this,"GET","/api/v1/cover-requests/"+id("coverRequestId",i));
        else if(operation==="redrawCover"){
          const note=String(this.getNodeParameter("coverNote",i,"")||"").trim();const credits=Number(this.getNodeParameter("coverCredits",i,0));
          if(!note)throw new NodeOperationError(this.getNode(),"A redraw needs a note",{itemIndex:i});
          if(!(credits>0))throw new NodeOperationError(this.getNode(),"Credits: redraw_credits from Price Covers",{itemIndex:i});
          result=await api.call(this,"POST",`/api/v1/cover-requests/${id("coverRequestId",i)}/draw`,{cover_id:required("coverId",i),note,credits});
        }
        else if(operation==="listSongCovers")result=await api.call(this,"GET",`/api/v1/songs/${id("analysisSongId",i)}/covers`);
        else if(operation==="useCover")result=await api.call(this,"POST",`/api/v1/songs/${id("analysisSongId",i)}/covers/${id("coverId",i)}/use`);
        else if(operation==="deleteCover"){await api.call(this,"DELETE",`/api/v1/songs/${id("analysisSongId",i)}/covers/${id("coverId",i)}`);result={deleted:true};}
        else if(operation==="downloadSongCover"||operation==="downloadSongAudio"){
          const song=await api.call(this,"GET","/api/v1/songs/"+id("analysisSongId",i)) as Json;
          const about={song_id:song.id,title:song.title,artist_name:song.artist_name??null};
          if(operation==="downloadSongCover"){
            if(!song.cover_art?.download_url)throw new NodeOperationError(this.getNode(),"This song has no cover",{itemIndex:i});
            result={...about,cover_id:song.cover_art.id??null,download_url:song.cover_art.download_url,full_size:song.cover_art.full_size??null,ai_made:Boolean(song.cover_art.ai_made)};
          }else{
            if(!song.audio?.download_url)throw new NodeOperationError(this.getNode(),"This song's audio can't be downloaded",{itemIndex:i});
            result={...about,download_url:song.audio.download_url,content_type:song.audio.content_type??null};
          }
        }
        else if(operation==="archiveSong"){await api.call(this,"DELETE","/api/v1/songs/"+id("analysisSongId",i));result={archived:true};}
        else if(operation==="reanalyzeSong")result=await api.call(this,"POST","/api/v1/songs/"+id("analysisSongId",i)+"/analysis");
        else if(operation==="setSongLyrics"){
          const lyrics=String(this.getNodeParameter("lyrics",i,"")||"").trim();
          if(!lyrics)throw new NodeOperationError(this.getNode(),"Lyrics are required",{itemIndex:i});
          result=await api.call(this,"POST","/api/v1/songs/"+id("analysisSongId",i)+"/lyrics",{lyrics});
        }
        else if(operation==="listIdeas"){
          const query=new URLSearchParams({limit:String(this.getNodeParameter("ideaLimit",i,30)),sort:String(this.getNodeParameter("ideaSort",i,"top"))});
          for(const [key,name] of [["q","ideaSearch"],["status","ideaStatus"],["area","ideaListArea"],["cursor","ideaCursor"]] as const){
            const value=String(this.getNodeParameter(name,i,"")||"").trim();if(value)query.set(key,value);
          }
          if(this.getNodeParameter("ideaYours",i,false))query.set("yours","true");
          result=await api.call(this,"GET","/api/v1/community/ideas?"+query.toString());
        }
        else if(operation==="getIdea")result=await api.call(this,"GET","/api/v1/community/ideas/"+id("ideaId",i));
        else if(operation==="voteForIdea")result=await api.call(this,"POST","/api/v1/community/ideas/"+id("ideaId",i)+"/vote");
        else if(operation==="removeIdeaVote")result=await api.call(this,"DELETE","/api/v1/community/ideas/"+id("ideaId",i)+"/vote");
        else if(operation==="followIdea")result=await api.call(this,"POST","/api/v1/community/ideas/"+id("ideaId",i)+"/follow");
        else if(operation==="unfollowIdea")result=await api.call(this,"DELETE","/api/v1/community/ideas/"+id("ideaId",i)+"/follow");
        else if(operation==="suggestIdea"){
          const body=String(this.getNodeParameter("ideaBody",i,"")||"").trim();
          result=await api.call(this,"POST","/api/v1/ideas",{title:String(this.getNodeParameter("ideaTitle",i)).trim(),...(body?{body}:{}),area:String(this.getNodeParameter("ideaArea",i,"everything"))});
        }
        else if(operation==="transcribeSong"){
          const path="/api/v1/songs/"+id("analysisSongId",i)+"/transcription";
          const credits=Number(this.getNodeParameter("transcribeCredits",i,0)),language=String(this.getNodeParameter("transcribeLanguage",i,"")||"").trim();
          result=credits>0?await api.call(this,"POST",path,{credits,...(language?{language}:{})}):{...await api.call(this,"GET",path) as Json,transcribed:false};
        }
        else if(operation==="setSongWords"){
          const raw=this.getNodeParameter("songWords",i,"[]");
          let words:unknown;try{words=typeof raw==="string"?JSON.parse(raw):raw;}catch{throw new NodeOperationError(this.getNode(),"Words must be JSON: a list of {text, start, end}",{itemIndex:i});}
          if(!Array.isArray(words)||!words.length)throw new NodeOperationError(this.getNode(),"Words must be a list of {text, start, end}",{itemIndex:i});
          result=await api.call(this,"POST","/api/v1/songs/"+id("analysisSongId",i)+"/words",{words});
        }
        else if(operation==="clearSongLyrics")result=await api.call(this,"DELETE","/api/v1/songs/"+id("analysisSongId",i)+"/lyrics");
        else if(operation==="editSongBrief"){
          const body:Record<string,unknown>={};
          for(const [key,name] of [["theme","briefTheme"],["story","briefStory"],["tone","briefTone"],["setting","briefSetting"]] as const){
            const value=String(this.getNodeParameter(name,i,"")||"").trim();if(value)body[key]=value;
          }
          const moods=((this.getNodeParameter("briefMoodArc",i,{}) as {section?:Array<{section?:string;feeling?:string}>}).section??[])
            .map(m=>({section:String(m.section??"").trim(),feeling:String(m.feeling??"").trim()})).filter(m=>m.section);
          if(moods.length)body.mood_arc=moods;
          if(!Object.keys(body).length)throw new NodeOperationError(this.getNode(),"Fill in at least one part of the brief to correct",{itemIndex:i});
          result=await api.call(this,"PATCH","/api/v1/songs/"+id("analysisSongId",i)+"/brief",body);
        }
        else if(operation==="rewriteSongBrief")result=await api.call(this,"POST","/api/v1/songs/"+id("analysisSongId",i)+"/brief");
        else if(operation==="setArtistImage"){
          const crop=this.getNodeParameter("pictureCrop",i,{}) as {x?:number;y?:number;size?:number};
          const square=crop.x!==undefined||crop.y!==undefined||crop.size!==undefined?{crop:{x:crop.x??0,y:crop.y??0,size:crop.size??1}}:{};
          const path="/api/v1/artists/"+id("artistId",i)+"/image";
          if(String(this.getNodeParameter("artistImageSource",i,"binary"))==="url"){
            const url=String(this.getNodeParameter("artistImageUrl",i,"")||"").trim();
            if(!url)throw new NodeOperationError(this.getNode(),"Image URL is required",{itemIndex:i});
            result=await api.call(this,"POST",path,{image_url:url,...square});
          }else{
            const property=String(this.getNodeParameter("artistImageBinaryProperty",i,"data")).trim();const image=items[i].binary?.[property];
            if(!image)throw new NodeOperationError(this.getNode(),"Binary property '"+property+"' was not found",{itemIndex:i});
            const form=new FormData();if(square.crop)form.set("crop",JSON.stringify(square.crop));
            form.set("image",new Blob([new Uint8Array(await this.helpers.getBinaryDataBuffer(i,property))],{type:image.mimeType||"image/jpeg"}),image.fileName||property+".jpg");
            result=await this.helpers.httpRequestWithAuthentication.call(this,"kinetuneApi",{method:"POST",url:await baseUrl(this)+path,body:form});
          }
        }
        else if(operation==="removeArtistImage")result=await api.call(this,"DELETE","/api/v1/artists/"+id("artistId",i)+"/image");
        else if(operation==="listArtistProfiles")result=await api.call(this,"GET","/api/v1/artists/"+id("artistId",i)+"/profiles");
        else if(operation==="addArtistProfile"){
          const platform=String(this.getNodeParameter("profilePlatform",i,"")||"").trim();const title=String(this.getNodeParameter("profileTitle",i,"")||"").trim();
          result=await api.call(this,"POST","/api/v1/artists/"+id("artistId",i)+"/profiles",{url:String(this.getNodeParameter("profileUrl",i)).trim(),...(platform?{platform}:{}),...(title?{title}:{})});
        }
        else if(operation==="reorderArtistProfiles"){
          const order=String(this.getNodeParameter("profileOrder",i)).split(/[\s,]+/).map(t=>t.trim()).filter(Boolean);
          if(!order.length)throw new NodeOperationError(this.getNode(),"Profile IDs in Order is required",{itemIndex:i});
          result=await api.call(this,"PATCH","/api/v1/artists/"+id("artistId",i)+"/profiles",{order});
        }
        else if(operation==="updateArtistProfile"||operation==="removeArtistProfile"){
          const profileId=String(this.getNodeParameter("profileId",i)).trim();
          if(!profileId)throw new NodeOperationError(this.getNode(),"Profile ID is required",{itemIndex:i});
          const path="/api/v1/artists/"+id("artistId",i)+"/profiles/"+encodeURIComponent(profileId);
          if(operation==="removeArtistProfile"){await api.call(this,"DELETE",path);result={removed:true};}
          else{
            const changes=this.getNodeParameter("profileChanges",i,{}) as {url?:string;title?:string;state?:string;confirmed?:boolean;position?:number};
            const body:Json={};
            if(changes.url!==undefined&&String(changes.url).trim())body.url=String(changes.url).trim();
            if(changes.title!==undefined)body.title=String(changes.title).trim()||null;
            if(changes.state)body.state=changes.state;
            if(changes.confirmed!==undefined)body.confirmed=changes.confirmed===true;
            if(changes.position!==undefined)body.position=Math.max(0,Math.trunc(Number(changes.position)||0));
            if(!Object.keys(body).length)throw new NodeOperationError(this.getNode(),"Add at least one change",{itemIndex:i});
            result=await api.call(this,"PATCH",path,body);
          }
        }
        else if(operation==="discoverArtistProfiles")result=await api.call(this,"POST","/api/v1/artists/"+id("artistId",i)+"/profiles/discover");
        else if(operation==="confirmAllArtistProfiles")result=await api.call(this,"POST","/api/v1/artists/"+id("artistId",i)+"/profiles/confirm");
        else if(operation==="getArtistPage")result=await api.call(this,"GET","/api/v1/artists/"+id("artistId",i)+"/page");
        else if(operation==="updateArtistPage"){
          // The JSON holds any draft field (sections and the rest); the simple fields above it win.
          const raw=this.getNodeParameter("pageJson",i,"{}");
          let extra:unknown=raw;
          if(typeof raw==="string"){
            try{extra=raw.trim()?JSON.parse(raw):{};}
            catch{throw new NodeOperationError(this.getNode(),"More Page Fields is not valid JSON",{itemIndex:i});}
          }
          if(!extra||typeof extra!=="object"||Array.isArray(extra))throw new NodeOperationError(this.getNode(),"More Page Fields must be a JSON object",{itemIndex:i});
          const body:Json={...(extra as Json)};delete body.artist_id;
          const theme=String(this.getNodeParameter("pageTheme",i,"")||"");if(theme)body.theme=theme;
          const genres=String(this.getNodeParameter("pageGenres",i,"")||"").split(",").map(g=>g.trim()).filter(Boolean);if(genres.length)body.genres=genres;
          const place=String(this.getNodeParameter("pagePlace",i,"")||"").trim();if(place)body.place=place;
          if(!Object.keys(body).length)throw new NodeOperationError(this.getNode(),"Set a theme, genres, a place or More Page Fields",{itemIndex:i});
          result=await api.call(this,"PATCH","/api/v1/artists/"+id("artistId",i)+"/page",body);
        }
        else if(operation==="previewArtistPage")result=await api.call(this,"GET","/api/v1/artists/"+id("artistId",i)+"/page/preview");
        else if(operation==="publishArtistPage")result=await api.call(this,"POST","/api/v1/artists/"+id("artistId",i)+"/page/publish");
        else if(operation==="unpublishArtistPage")result=await api.call(this,"POST","/api/v1/artists/"+id("artistId",i)+"/page/unpublish");
        else if(operation==="getArtistPageStats"){
          const days=Math.trunc(Number(this.getNodeParameter("statsDays",i,30))||30);
          result=await api.call(this,"GET","/api/v1/artists/"+id("artistId",i)+"/page/stats?days="+days);
        }
        else if(operation==="claimArtistHandle"||operation==="checkHandle"){
          const handle=String(this.getNodeParameter("handle",i)).trim().replace(/^(https?:\/\/)?(www\.)?kinetune\.com\//i,"").replace(/^@/,"");
          if(!handle)throw new NodeOperationError(this.getNode(),"Address is required",{itemIndex:i});
          if(operation==="claimArtistHandle"){
            result=await api.call(this,"POST","/api/v1/artists/"+id("artistId",i)+"/handle",{handle,...(this.getNodeParameter("takeFromProfile",i,false)===true?{take_from_profile:true}:{})});
          }
          else{
            const artist=locatorValue(this,"artistId",i);
            result=await api.call(this,"GET","/api/v1/handles/"+encodeURIComponent(handle)+(artist?"?artist_id="+encodeURIComponent(artist):""));
          }
        }
        else if(operation==="saveLook")result=await api.call(this,"POST","/api/v1/looks",{name:String(this.getNodeParameter("lookName",i)).trim(),from_id:required("fromLookId",i),...lookChanges(this,i)});
        else if(operation==="getSongDraft")result=await api.call(this,"GET","/api/v1/songs/"+id("analysisSongId",i)+"/draft");
        else if(operation==="listClips"){
          const query=new URLSearchParams();
          for(const [key,name] of [["moods","clipMoods"],["folders","clipFolders"],["looks","clipLooks"]] as const){const list=commaList(this.getNodeParameter(name,i,""));if(list.length)query.set(key,list.join(","));}
          const qs=query.toString();result=await api.call(this,"GET","/api/v1/clips"+(qs?"?"+qs:""));
        }
        else if(operation==="generateClips"){
          const text=(name:string)=>String(this.getNodeParameter(name,i,"")||"").trim();
          const prompt=text("clipPrompt"),from=text("clipFrom"),songId=text("clipSongId"),who=text("clipWith"),credits=Math.trunc(Number(this.getNodeParameter("clipCredits",i,0))||0);
          const kind=String(this.getNodeParameter("clipKind",i,"video"));
          if(!prompt&&!from)throw new NodeOperationError(this.getNode(),"A prompt, or an idea from the song or its cover, is required",{itemIndex:i});
          if((from||who)&&!songId)throw new NodeOperationError(this.getNode(),"Song ID is required with Idea From or With",{itemIndex:i});
          result=await api.call(this,"POST","/api/v1/clips/generate",{...(prompt?{prompt}:{}),kind,shape:String(this.getNodeParameter("clipGenerateShape",i,"tall")),
            count:Math.trunc(Number(this.getNodeParameter("clipCount",i,1))||1),...(songId?{song_id:songId}:{}),...(from?{from}:{}),...(who?{with:who}:{}),
            ...(kind==="video"&&String(this.getNodeParameter("clipModel",i,"")).trim()?{model:String(this.getNodeParameter("clipModel",i,"")).trim()}:{}),...(kind==="video"&&this.getNodeParameter("clipQuality",i,"standard")==="high"?{quality:"high"}:{}),...(kind==="video"&&this.getNodeParameter("clipLoop",i,false)?{loop:true}:{}),...(text("clipStyle")?{style:text("clipStyle")}:{}),
            ...(credits>0?{credits}:{})});
        }
        else if(operation==="analyzeClips")result=await api.call(this,"POST","/api/v1/clips/analyze",{clip_ids:commaList(this.getNodeParameter("analyzeClipIds",i)),behind:Boolean(this.getNodeParameter("analyzeBehind",i,false))});
        else if(operation==="moveClips")result=await api.call(this,"POST","/api/v1/clips/move",{clip_ids:String(this.getNodeParameter("clipIds",i)).split(",").map(x=>x.trim()).filter(Boolean),folder_id:id("clipFolderId",i)});
        else if(operation==="deleteClip"){await api.call(this,"DELETE","/api/v1/clips/"+id("clipId",i));result={deleted:true};}
        else if(operation==="listClipFolders")result=await api.call(this,"GET","/api/v1/clip-folders");
        else if(operation==="listCanvasPresets")result=await api.call(this,"GET","/api/v1/canvas-presets");
        else if(operation==="saveCanvasPreset"){
          const raw=this.getNodeParameter("canvasPresetLook",i,"{}");
          let look:unknown;try{look=typeof raw==="string"?JSON.parse(raw):raw;}catch{throw new NodeOperationError(this.getNode(),"Look must be JSON",{itemIndex:i});}
          result=await api.call(this,"POST","/api/v1/canvas-presets",{name:String(this.getNodeParameter("canvasPresetName",i,"")).trim(),look});
        }
        else if(operation==="renameCanvasPreset"){await api.call(this,"PATCH","/api/v1/canvas-presets/"+id("canvasPresetId",i),{name:String(this.getNodeParameter("canvasPresetName",i,"")).trim()});result={renamed:true};}
        else if(operation==="deleteCanvasPreset"){await api.call(this,"DELETE","/api/v1/canvas-presets/"+id("canvasPresetId",i));result={deleted:true};}
        else if(operation==="createClipFolder")result=await api.call(this,"POST","/api/v1/clip-folders",{name:String(this.getNodeParameter("clipFolderName",i,"")).trim()});
        else if(operation==="browseClipMood"){
          const query=new URLSearchParams({shape:String(this.getNodeParameter("clipBrowseShape",i,"both")),energy:String(this.getNodeParameter("clipEnergy",i,"all")),
            sort:String(this.getNodeParameter("clipSort",i,"best")),offset:String(Math.trunc(Number(this.getNodeParameter("clipOffset",i,0))||0)),
            limit:String(Math.trunc(Number(this.getNodeParameter("clipLimit",i,60))||60))});
          result=await api.call(this,"GET","/api/v1/clip-moods/"+id("clipMoodId",i)+"?"+query);
        }
        else if(operation==="clipRebound"){
          const query=new URLSearchParams({at:String(Number(this.getNodeParameter("reboundAt",i,0))||0),half:String(Number(this.getNodeParameter("reboundHalf",i,4))||4),speed:String(Number(this.getNodeParameter("reboundSpeed",i,1))||1),
            ...(this.getNodeParameter("reboundSteady",i,false)?{steady:"true"}:{})});
          result=await api.call(this,"GET","/api/v1/clips/"+id("clipId",i)+"/rebound?"+query.toString());
        }
        else if(operation==="retryClipImport")result=await api.call(this,"POST","/api/v1/clip-imports/"+id("clipImportId",i),{action:"retry"});
        else if(operation==="dismissClipImport"){await api.call(this,"DELETE","/api/v1/clip-imports/"+id("clipImportId",i));result={dismissed:true};}
        else if(operation==="clipSteady")result=await api.call(this,"GET","/api/v1/clips/"+id("clipId",i)+"/steady");
        else if(operation==="clipBestSpot"){
          const query=new URLSearchParams({span:String(Number(this.getNodeParameter("loopSpan",i,4))||4),seam:String(Number(this.getNodeParameter("loopSeam",i,.75))||0)});
          result=await api.call(this,"GET","/api/v1/clips/"+id("clipId",i)+"/loop?"+query.toString());
        }
        else if(operation==="similarClips")result=await api.call(this,"GET","/api/v1/clips/"+id("clipId",i)+"/similar?limit="+Math.trunc(Number(this.getNodeParameter("clipSimilarLimit",i,24))||24));
        else if(operation==="getClipFolder")result=await api.call(this,"GET","/api/v1/clip-folders/"+id("clipFolderId",i));
        else if(operation==="renameClipFolder"){await api.call(this,"PATCH","/api/v1/clip-folders/"+id("clipFolderId",i),{name:String(this.getNodeParameter("clipFolderName",i,"")).trim()});result={renamed:true};}
        else if(operation==="deleteClipFolder"){await api.call(this,"DELETE","/api/v1/clip-folders/"+id("clipFolderId",i));result={deleted:true};}
        else if(operation==="importClips"){
          const source=String(this.getNodeParameter("clipImportSource",i,"url"));
          const [key,name]=({url:["url","clipImportUrl"],file:["file_url","clipImportFileUrl"],stock:["stock_id","clipImportStockId"]} as Record<string,[string,string]>)[source]??["url","clipImportUrl"];
          const value=String(this.getNodeParameter(name,i,"")||"").trim();
          if(!value)throw new NodeOperationError(this.getNode(),"What to import is required",{itemIndex:i});
          result=await api.call(this,"POST",`/api/v1/clip-folders/${id("clipFolderId",i)}/imports`,{[key]:value});
        }
        else if(operation==="listCharacters"){
          const artistId=String(this.getNodeParameter("characterArtistId",i,"")).trim();
          const field={artist:"artist_id",owner:"owner_artist_id",for:"for_artist_id"}[String(this.getNodeParameter("characterListScope",i,"artist"))]??"artist_id";
          result=await api.call(this,"GET","/api/v1/characters"+(artistId?"?"+field+"="+encodeURIComponent(artistId):""));
        }
        else if(["getFaceCheck","startFaceCheck","withdrawFaceCheck"].includes(operation)){
          const path="/api/v1/characters/"+encodeURIComponent(String(this.getNodeParameter("faceCheckCharacterId",i)).trim())+"/face-check";
          const model=String(this.getNodeParameter("faceCheckModel",i));
          if(operation==="startFaceCheck"){
            if(!this.getNodeParameter("faceCheckConsent",i,false))throw new NodeOperationError(this.getNode(),"The person must agree to the face check first",{itemIndex:i});
            result=await api.call(this,"POST",path,{model,consent:true});
          }else if(operation==="withdrawFaceCheck")result=await api.call(this,"DELETE",path+"?model="+encodeURIComponent(model));
          else if(operation==="getFaceCheck")result=await api.call(this,"GET",path+"?model="+encodeURIComponent(model));
        }
        else if(operation==="listCharacterRequests")result=await api.call(this,"GET","/api/v1/character-requests");
        else if(operation==="startCharacter"&&this.getNodeParameter("characterMode",i,"generate")==="describe"){
          result=await api.call(this,"POST","/api/v1/character-requests",{mode:"describe",description:String(this.getNodeParameter("characterDescription",i)).trim()});
        }
        else if(operation==="startCharacter"){
          if(!this.getNodeParameter("characterRights",i,false))throw new NodeOperationError(this.getNode(),"Confirm you have the rights to use these images",{itemIndex:i});
          const mode=String(this.getNodeParameter("characterMode",i,"generate"));
          const properties=String(this.getNodeParameter("characterBinaryProperties",i)).split(",").map(p=>p.trim()).filter(Boolean);
          const form=new FormData();form.set("rights_confirmed","true");form.set("mode",mode);
          for(const property of properties){
            const image=items[i].binary?.[property];
            if(!image)throw new NodeOperationError(this.getNode(),"Binary property '"+property+"' was not found",{itemIndex:i});
            form.append(mode==="add"?"sheet":"photos",new Blob([new Uint8Array(await this.helpers.getBinaryDataBuffer(i,property))],{type:image.mimeType||"image/jpeg"}),image.fileName||property+".jpg");
          }
          const base=await baseUrl(this);
          result=await this.helpers.httpRequestWithAuthentication.call(this,"kinetuneApi",{method:"POST",url:base+"/api/v1/character-requests",body:form});
        }
        else if(["getCharacterRequest","drawCharacterSheet","keepCharacter","discardCharacterRequest"].includes(operation)){
          const path="/api/v1/character-requests/"+encodeURIComponent(String(this.getNodeParameter("characterRequestId",i)).trim());
          if(operation==="getCharacterRequest")result=await api.call(this,"GET",path);
          else if(operation==="discardCharacterRequest"){await api.call(this,"DELETE",path);result={discarded:true};}
          else if(operation==="drawCharacterSheet"){
            const outfit=String(this.getNodeParameter("characterOutfit",i,"")).trim(),note=String(this.getNodeParameter("characterNote",i,"")).trim();
            result=await api.call(this,"POST",path+"/draw",{credits:Number(this.getNodeParameter("characterCredits",i)),...(outfit?{outfit}:{}),...(note?{note}:{})});
          }else if(operation==="keepCharacter"){
            const artistId=String(this.getNodeParameter("characterArtistId",i,"")).trim(),name=String(this.getNodeParameter("characterName",i,"")).trim();
            const person=String(this.getNodeParameter("characterPerson",i,""));
            const owner=String(this.getNodeParameter("characterOwnerId",i,"")).trim();
            result=await api.call(this,"POST",path+"/keep",{...(artistId?{artist_id:artistId,...(this.getNodeParameter("characterReplace",i,false)?{replace:true}:{})}:{name,...(owner?{owner_artist_id:owner}:{})}),
              ...(this.getNodeParameter("kitShared",i,false)?{shared:true}:{}),...(person?{ai_made:person==="ai"}:{})});
          }
        }
        else if(operation==="listKit"){
          const query=new URLSearchParams();const artistId=locatorValue(this,"kitArtistId",i);const kind=String(this.getNodeParameter("kitListKind",i,"")||"");
          if(artistId)query.set(this.getNodeParameter("kitListScope",i,"for")==="own"?"owner_artist_id":"artist_id",artistId);if(kind)query.set("kind",kind);
          const q=String(this.getNodeParameter("kitSearch",i,"")||"").trim();if(q)query.set("q",q);
          const limit=Math.trunc(Number(this.getNodeParameter("kitLimit",i,0))||0),offset=Math.trunc(Number(this.getNodeParameter("kitOffset",i,0))||0);
          if(limit>0)query.set("limit",String(limit));if(offset>0)query.set("offset",String(offset));
          const qs=query.toString();result=await api.call(this,"GET","/api/v1/kit"+(qs?"?"+qs:""));
        }
        else if(operation==="addKitPiece"){
          const fields=kitPieceFields(this,i);const source=String(this.getNodeParameter("kitSource",i,"binary"));
          if(source!=="stock"&&!this.getNodeParameter("kitRights",i,false))throw new NodeOperationError(this.getNode(),"Confirm you have the rights to use this image",{itemIndex:i});
          if(source==="stock")result=await api.call(this,"POST","/api/v1/kit",{...fields,stock_id:String(this.getNodeParameter("kitStockId",i,"")).trim()});
          else if(source==="url")result=await api.call(this,"POST","/api/v1/kit",{...fields,file_url:String(this.getNodeParameter("kitFileUrl",i,"")).trim(),rights_confirmed:true});
          else{
            const property=String(this.getNodeParameter("kitBinaryProperty",i,"data")).trim();const image=items[i].binary?.[property];
            if(!image)throw new NodeOperationError(this.getNode(),"Binary property '"+property+"' was not found",{itemIndex:i});
            const form=new FormData();form.set("rights_confirmed","true");
            for(const [key,value] of Object.entries(fields))form.set(key,typeof value==="string"?value:JSON.stringify(value));
            form.set("file",new Blob([new Uint8Array(await this.helpers.getBinaryDataBuffer(i,property))],{type:image.mimeType||"image/jpeg"}),image.fileName||property+".jpg");
            result=await this.helpers.httpRequestWithAuthentication.call(this,"kinetuneApi",{method:"POST",url:await baseUrl(this)+"/api/v1/kit",body:form});
          }
        }
        else if(operation==="getKitPiece")result=await api.call(this,"GET","/api/v1/kit/"+id("kitId",i));
        else if(operation==="updateKitPiece"){
          const text=(name:string)=>String(this.getNodeParameter(name,i,"")||"").trim();
          const changes={...(text("kitName")?{name:text("kitName")}:{}),...(text("kitHandle")?{handle:text("kitHandle")}:{}),...(text("kitDescription")?{description:text("kitDescription")}:{}),
            ...cropOf(this.getNodeParameter("kitCrop",i,{}) as Json),...(text("characterPerson")?{ai_made:text("characterPerson")==="ai"}:{}),
            ...(text("kitSharing")?{shared:text("kitSharing")==="shared"}:{}),...(this.getNodeParameter("kitKeep",i,false)?{kept:true}:{})};
          if(!Object.keys(changes).length)throw new NodeOperationError(this.getNode(),"Set a new name, handle, description, crop, person, sharing or keep",{itemIndex:i});
          result=await api.call(this,"PATCH","/api/v1/kit/"+id("kitId",i),changes);
        }
        else if(operation==="deleteKitPiece"){await api.call(this,"DELETE","/api/v1/kit/"+id("kitId",i));result={deleted:true};}
        else if(operation==="drawPlaceAngles"){
          const angles=this.getNodeParameter("kitAngles",i,[]) as string[],confirm=Boolean(this.getNodeParameter("kitAnglesConfirm",i,false));
          if(!angles.length)throw new NodeOperationError(this.getNode(),"Choose at least one angle",{itemIndex:i});
          const credits=confirm?Number(this.getNodeParameter("kitAnglesCredits",i,0)):0;
          result=await api.call(this,"POST",`/api/v1/kit/${id("kitId",i)}/angles`,{angles,...(confirm?{confirm:true}:{}),...(credits>0?{credits}:{})});
        }
        else if(operation==="castMusicVideo")result=await api.call(this,"POST","/api/v1/music-video-castings",{song_id:locatorValue(this,"songId",i),...musicVideoBrief(this,i)});
        else if(operation==="getCasting")result=await api.call(this,"GET","/api/v1/music-video-castings/"+id("castingId",i));
        else if(operation==="deleteCasting"){await api.call(this,"DELETE","/api/v1/music-video-castings/"+id("castingId",i));result={deleted:true};}
        else if(operation==="drawCast"){
          const people=((this.getNodeParameter("castPeople",i,{}) as {person?:Array<{index:number;name?:string;description?:string;character?:string}>}).person??[]).map(p=>{
            const name=String(p.name||"").trim(),description=String(p.description||"").trim(),character=String(p.character||"").trim().replace(/^@/,"");
            return {index:Number(p.index),...(name?{name}:{}),...(description?{description}:{}),...(character?{character}:{})};});
          result=await api.call(this,"POST",`/api/v1/music-video-castings/${id("castingId",i)}/draw`,{credits:Number(this.getNodeParameter("castCredits",i,0)||0),people});
        }
        else throw new NodeOperationError(this.getNode(),"Unsupported operation",{itemIndex:i});
        out.push({json:result,pairedItem:{item:i}});
      }catch(error){if(this.continueOnFail())out.push({json:{error:error instanceof Error?error.message:String(error)},pairedItem:{item:i}});else throw error instanceof NodeApiError||error instanceof NodeOperationError?error:new NodeOperationError(this.getNode(),error as Error,{itemIndex:i});}
    }
    return [out];
  }
}
