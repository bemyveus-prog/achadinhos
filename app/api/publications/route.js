import { isAdmin, unauthorized } from "@/lib/auth";
import { db, hasDb } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET() {
 if (!(await isAdmin())) return unauthorized();
 if (!hasDb()) return Response.json({error:"Supabase não configurado."},{status:503});
 const {data,error}=await db().from("publications").select("*").order("created_at",{ascending:false}).limit(100);
 if(error) return Response.json({error:error.message},{status:500});
 return Response.json(data||[]);
}

export async function POST(request) {
 if (!(await isAdmin())) return unauthorized();
 if (!hasDb()) return Response.json({error:"Supabase não configurado."},{status:503});
 try {
  const body=await request.json();
  const ids=[...new Set((Array.isArray(body.product_ids)?body.product_ids:[]).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))];
  if(!ids.length) return Response.json({error:"Selecione pelo menos um produto."},{status:400});
  if(ids.length>10) return Response.json({error:"Máximo de 10 produtos por carrossel."},{status:400});
  const platforms=[...new Set((Array.isArray(body.platforms)?body.platforms:[]).filter(p=>["instagram","facebook","pinterest","tiktok"].includes(p)))];
  if(!platforms.length) return Response.json({error:"Selecione uma rede social."},{status:400});
  const {data:offers,error:offerError}=await db().from("offers").select("id,title,description,image_url,image_urls,price,original_price,link,platform,category,badge,active").in("id",ids).eq("active",true);
  if(offerError) throw offerError;
  const products=ids.map(id=>offers.find(o=>o.id===id)).filter(Boolean);
  if(!products.length) return Response.json({error:"Nenhum produto ativo encontrado."},{status:404});
  const date=body.scheduled_at?new Date(body.scheduled_at):null;
  if(date && Number.isNaN(date.getTime())) return Response.json({error:"Data inválida."},{status:400});
  const payload={
   title:String(body.title||"Carrossel MIX da Pri").trim().slice(0,160),
   caption:String(body.caption||"").slice(0,5000),
   hashtags:String(body.hashtags||"").slice(0,1200),
   platforms,status:date?"scheduled":"draft",scheduled_at:date?.toISOString()||null,products:products.map(p=>({...p,carousel_slides:Array.isArray(body.slides)?body.slides.slice(0,7):[]}))
  };
  const {data,error}=await db().from("publications").insert(payload).select("*").single();
  if(error) throw error;
  return Response.json(data,{status:201});
 } catch(e) { return Response.json({error:e.message||"Falha ao salvar."},{status:500}); }
}
