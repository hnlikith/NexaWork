/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import React from "react";
import type { TemplateData } from "@/lib/onboarding/types";
import { DocStyle, DocShell } from "./docStyles";
import { PaginatedDoc } from "./PaginatedDoc";
import { buildOfferLetterBlocks } from "./blocks";

export function OfferLetterTemplate({ data, withStyle = true, paged = false }: { data: TemplateData; withStyle?: boolean; paged?: boolean }) {
  const blocks = buildOfferLetterBlocks(data);
  return (
    <>
      {withStyle && <DocStyle />}
      {paged
        ? <DocShell paged>{blocks}</DocShell>
        : <PaginatedDoc blocks={blocks} signature={data.signature} candidateName={data.candidate.name} />}
    </>
  );
}
