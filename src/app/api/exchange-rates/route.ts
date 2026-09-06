/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const baseCurrency = searchParams.get("from") || "INR";

  try {
    // Try primary API
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`, {
      headers: { "User-Agent": "Finance-Dashboard" },
    });

    if (!res.ok) throw new Error("Primary API failed");

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    try {
      // Fallback to alternative API
      const res = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`);

      if (!res.ok) throw new Error("Fallback API failed");

      const data = await res.json();
      // Transform frankfurter format to exchangerate format
      return NextResponse.json({
        base: data.base,
        date: data.date,
        rates: data.rates,
      });
    } catch {
      // Return default rates if all APIs fail
      return NextResponse.json(
        {
          base: baseCurrency,
          rates: {
            INR: baseCurrency === "INR" ? 1 : 83,
            USD: baseCurrency === "USD" ? 1 : 0.012,
            EUR: baseCurrency === "EUR" ? 1 : 0.011,
            GBP: baseCurrency === "GBP" ? 1 : 0.0095,
          },
        },
        { status: 200 }
      );
    }
  }
}
