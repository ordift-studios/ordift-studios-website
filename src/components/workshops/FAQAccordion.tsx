"use client";

import { useState } from "react";
import type { FAQ } from "@/lib/content/types";

export default function FAQAccordion({ faqs }: { faqs: FAQ[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-black/10 border-t border-b border-black/10">
      {faqs.map((faq) => {
        const isOpen = openId === faq.id;
        return (
          <div key={faq.id}>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-4 py-4 text-left min-h-11"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : faq.id)}
            >
              <span className="font-sans font-medium text-body text-ordift-ink">
                {faq.question}
              </span>
              <span className="font-sans text-body text-ordift-ink-muted shrink-0">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && (
              <p className="font-sans text-body-small text-ordift-ink-muted pb-4 pr-8">
                {faq.answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
