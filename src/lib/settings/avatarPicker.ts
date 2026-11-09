// Profile photo picking without a native image-picker: a tiny page inside a
// react-native-webview (Android's WebView opens the system file chooser for an
// <input type=file>). The page validates, centre-crops to 256x256 and returns a
// JPEG data URL — the same steps as the web's src/lib/settings/avatarImage.ts.
export const AVATAR_SIZE = 256;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
export const AVATAR_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type AvatarPickError = "type" | "size" | "read";
export type AvatarPickMessage = { dataUrl: string } | { error: AvatarPickError } | null;

export function parseAvatarMessage(raw: string): AvatarPickMessage {
  try {
    const m = JSON.parse(raw);
    if (m && typeof m.dataUrl === "string" && m.dataUrl.startsWith("data:image/jpeg")) return { dataUrl: m.dataUrl };
    if (m && (m.error === "type" || m.error === "size" || m.error === "read")) return { error: m.error };
  } catch {
    // fall through
  }
  return null;
}

export function avatarPickerHtml(opts: { label: string; background: string; accent: string; accentText: string }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:${opts.background};font-family:sans-serif}
body{display:flex;align-items:center;justify-content:center}
label{display:block;box-sizing:border-box;width:86%;text-align:center;padding:14px;border-radius:6px;background:${opts.accent};color:${opts.accentText};font-weight:800;font-size:16px}
input{display:none}</style></head><body>
<label>${esc(opts.label)}<input id="f" type="file" accept="${AVATAR_ACCEPT}"></label>
<script>
var T=${JSON.stringify(AVATAR_ACCEPT.split(","))},MAX=${AVATAR_MAX_FILE_BYTES},S=${AVATAR_SIZE};
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
document.getElementById("f").addEventListener("change",async function(e){
  var f=e.target.files&&e.target.files[0];if(!f)return;
  if(T.indexOf(f.type)<0){post({error:"type"});return}
  if(f.size>MAX){post({error:"size"});return}
  try{
    var b=await createImageBitmap(f),side=Math.min(b.width,b.height),c=document.createElement("canvas");
    c.width=S;c.height=S;
    c.getContext("2d").drawImage(b,(b.width-side)/2,(b.height-side)/2,side,side,0,0,S,S);
    if(b.close)b.close();
    post({dataUrl:c.toDataURL("image/jpeg",0.85)});
  }catch(err){post({error:"read"})}
});
</script></body></html>`;
}
