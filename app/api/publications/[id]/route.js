import { isAdmin, unauthorized } from "@/lib/auth";
import { db, hasDb } from "@/lib/supabase";
export async function PATCH(request,{params}) {
 if(!(await isAdmin())) return unauthorized();
 if(!hasDb()) return Response.json({error:"Supabase não configurado."},{status:503});
 try {
  const {id}=await params, body=await request.json(), update={updated_at:new Date().toISOString()};
  for(const key of ["title","caption","hashtags"]) if(typeof body[key]==="string") update[key]=body[key].slice(0,key==="title"?160:key==="caption"?5000:1200);
  if(Array.isArray(body.platforms)) update.platforms=[...new Set(body.platforms.filter(p=>["instagram","facebook","pinterest","tiktok"].includes(p)))];
  if(body.status && ["draft","scheduled"].includes(body.status)){update.status=body.status;if(body.status==="draft")update.scheduled_at=null;}
  if(body.scheduled_at!==undefined){const d=body.scheduled_at?new Date(body.scheduled_at):null;if(d&&Number.isNaN(d.getTime()))return Response.json({error:"Data inválida."},{status:400});update.scheduled_at=d?.toISOString()||null;if(d)update.status="scheduled";}
  const {data,error}=await db().from("publications").update(update).eq("id",Number(id)).select("*").single();
  if(error) throw error;
  return Response.json(data);
 } catch(e){return Response.json({error:e.message||"Falha ao atualizar."},{status:500});}
}
export async function DELETE(_request,{params}) {
 if(!(await isAdmin())) return unauthorized();
 if(!hasDb()) return Response.json({error:"Supabase não configurado."},{status:503});
 const {id}=await params, {error}=await db().from("publications").delete().eq("id",Number(id));
 if(error)return Response.json({error:error.message},{status:500});
 return Response.json({ok:true});
}
