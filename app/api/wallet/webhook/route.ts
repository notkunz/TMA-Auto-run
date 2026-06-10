import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(body)
    .digest("hex");

  if (hash !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body);

  if (event.event === "charge.success") {
    const reference = event.data.reference;
    const amount = event.data.amount / 100;

    // Both apps share the same Supabase, so just check transactions table
    const { data: transaction } = (await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("id", reference)
      .single()) as { data: any };

    if (transaction && transaction.status === "pending") {
      await supabaseAdmin.rpc("credit_wallet", {
        p_user_id: transaction.user_id,
        p_amount: transaction.amount,
      });

      await supabaseAdmin
        .from("transactions")
        .update({ status: "success" })
        .eq("id", reference);
    }
  }

  return NextResponse.json({ received: true });
}
