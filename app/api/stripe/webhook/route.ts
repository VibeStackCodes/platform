/**
 * Stripe Webhook API Route
 * Handles Stripe webhook events for subscription lifecycle
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase-server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

// Webhook secret for signature verification
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    // Use service client to bypass RLS for webhook updates
    const supabase = await createServiceClient();

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;

        if (!userId) {
          console.error("No supabase_user_id in session metadata");
          break;
        }

        // Update user plan to 'pro'
        const { error } = await supabase
          .from("profiles")
          .update({ plan: "pro" })
          .eq("id", userId);

        if (error) {
          console.error("Failed to update user plan:", error);
        } else {
          console.log(`User ${userId} upgraded to Pro plan`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const { data: profile, error: fetchError } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (fetchError || !profile) {
          console.error("Failed to find user by customer ID:", fetchError);
          break;
        }

        // Downgrade user plan to 'free'
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ plan: "free" })
          .eq("id", profile.id);

        if (updateError) {
          console.error("Failed to downgrade user plan:", updateError);
        } else {
          console.log(`User ${profile.id} downgraded to Free plan`);
        }
        break;
      }

      case "customer.subscription.updated": {
        // Handle subscription updates (e.g., plan changes, cancellations)
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const { data: profile, error: fetchError } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (fetchError || !profile) {
          console.error("Failed to find user by customer ID:", fetchError);
          break;
        }

        // Update plan based on subscription status
        const plan = subscription.status === "active" ? "pro" : "free";
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ plan })
          .eq("id", profile.id);

        if (updateError) {
          console.error("Failed to update user plan:", updateError);
        } else {
          console.log(`User ${profile.id} plan updated to ${plan}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Webhook processing failed",
      },
      { status: 500 }
    );
  }
}
