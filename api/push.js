import webpush from "web-push";

const SUPABASE_URL = "https://xcybjuwearndoljqkzmy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8egrnqtwHtrfzvtPcldiQw_y1Wqhh9w";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const json = (res, status, body) => res.status(status).setHeader("Cache-Control","no-store").json(body);
async function db(path, options={}) {
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers,...options.headers}});
  const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
  if(!response.ok)throw new Error(typeof data==="string"?data:data?.message||"Database request failed");
  return data;
}
export default async function handler(req,res){
  try{
    if(req.method==="GET" && req.query.action==="public-key"){
      if(!process.env.VAPID_PUBLIC_KEY)return json(res,503,{error:"Push notifications are not configured."});
      return json(res,200,{publicKey:process.env.VAPID_PUBLIC_KEY});
    }
    if(req.method==="POST" && req.headers["x-push-cron-secret"]===process.env.PUSH_CRON_SECRET){
      if(!SERVICE_KEY||!process.env.VAPID_PRIVATE_KEY||!process.env.VAPID_PUBLIC_KEY)throw new Error("Push service configuration is incomplete.");
      webpush.setVapidDetails(process.env.VAPID_SUBJECT||"mailto:support@uni-verse.site",process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
      const now=new Date(), horizon=new Date(now.getTime()+60*60000);
      const due=await db("student_timetable_events?select=id,user_id,title,event_type,location,starts_at,reminder_minutes,reminder_sent_at&reminder_minutes=gt.0&reminder_sent_at=is.null&starts_at=gt."+encodeURIComponent(now.toISOString())+"&starts_at=lte."+encodeURIComponent(horizon.toISOString()));
      let sent=0,failed=0;
      for(const event of due||[]){
        const dueAt=new Date(new Date(event.starts_at).getTime()-Number(event.reminder_minutes)*60000);
        if(dueAt>now)continue;
        const subscriptions=await db("student_push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq."+encodeURIComponent(event.user_id));
        if(!subscriptions?.length)continue;
        const payload=JSON.stringify({title:"Upcoming: "+event.title,body:(event.event_type||"Event")+" starts at "+new Date(event.starts_at).toLocaleTimeString("en-NG",{hour:"numeric",minute:"2-digit",timeZone:"Africa/Lagos"})+(event.location?" · "+event.location:""),url:"/timetable.html"});
        let delivered=false;
        for(const sub of subscriptions){
          try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload);sent++;delivered=true;}
          catch(error){failed++;if(error.statusCode===404||error.statusCode===410)await db("student_push_subscriptions?id=eq."+encodeURIComponent(sub.id),{method:"DELETE"});}
        }
        if(delivered)await db("student_timetable_events?id=eq."+encodeURIComponent(event.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({reminder_sent_at:new Date().toISOString()})});
      }
      return json(res,200,{processed:due?.length||0,sent,failed});
    }
    if(req.method!=="POST")return json(res,405,{error:"Method not allowed."});
    const authorization=req.headers.authorization||"";
    const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
    if(!token)return json(res,401,{error:"Sign in is required."});
    const userResponse=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+token}});
    if(!userResponse.ok)return json(res,401,{error:"Your session is invalid. Sign in again."});
    const user=await userResponse.json();
    const {action,subscription}=req.body||{};
    if(action==="subscribe"){
      if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth||!subscription.endpoint.startsWith("https://"))return json(res,400,{error:"Invalid push subscription."});
      await db("student_push_subscriptions?on_conflict=endpoint",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:user.id,endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth})});
      return json(res,200,{subscribed:true});
    }
    if(action==="unsubscribe"){
      if(!subscription?.endpoint)return json(res,400,{error:"Subscription endpoint is required."});
      await db("student_push_subscriptions?endpoint=eq."+encodeURIComponent(subscription.endpoint)+"&user_id=eq."+encodeURIComponent(user.id),{method:"DELETE"});
      return json(res,200,{unsubscribed:true});
    }
    return json(res,400,{error:"Unknown push action."});
  }catch(error){console.error("[push]",error?.message||error);return json(res,500,{error:"The push notification request failed."});}
}
export const config={maxDuration:60};
