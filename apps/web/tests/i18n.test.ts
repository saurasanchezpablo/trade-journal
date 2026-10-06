import { describe, expect, it } from "vitest";
import { ES } from "../src/lib/i18n/es-index";
import { translate, translateCount, translateIn } from "../src/lib/i18n";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("the Spanish dictionary", () => {
  it("keeps every value of the English text, and leaves nothing empty", () => {
    const broken = Object.entries(ES).filter(
      ([english, spanish]) =>
        !spanish.trim() ||
        JSON.stringify(placeholders(english.replace(/^[\w-]+\|/, ""))) !==
          JSON.stringify(placeholders(spanish)),
    );
    expect(broken).toEqual([]);
  });

  it("uses no em dashes", () => {
    expect(Object.values(ES).filter((spanish) => spanish.includes("—"))).toEqual([]);
  });
});

describe("translating", () => {
  it("shows the language's text with its values, and English for anything without one", () => {
    expect(translate("es", "Settings")).toBe("Ajustes");
    expect(translate("en", "Settings")).toBe("Settings");
    expect(translate("es", "A text nobody translated {n}", { n: 3 })).toBe(
      "A text nobody translated 3",
    );
    expect(translate("es", "Request failed ({status})", { status: 502 })).toBe(
      "La solicitud falló (502)",
    );
  });

  it("picks the wording for a count and the word for its context", () => {
    expect(translateCount("en", 1, "{count} trade", "{count} trades")).toBe("1 trade");
    expect(translateCount("en", 3, "{count} trade", "{count} trades")).toBe("3 trades");
    expect(translateIn("es", "status", "Open")).toBe("Abierta");
    expect(translateIn("es", "button", "Open")).toBe("Abrir");
  });
});

describe("alerts in the journal's language", () => {
  it("a chart alert and its plan note read in Spanish, and in English by default", async () => {
    const { setActiveLocale } = await import("../src/lib/i18n");
    const { lineAlert, alertText } = await import("../src/lib/alert-messages");
    const plan = {
      bias: "long" as const,
      playbookId: null,
      scenarios: [
        {
          id: "s",
          name: "Reclaim",
          direction: "long" as const,
          trigger: 100,
          target: 108,
          invalidation: 97,
          notes: "",
        },
      ],
    };
    const hit = { drawingId: "d", direction: "up" as const, price: 100 };
    try {
      setActiveLocale("es");
      const message = lineAlert("a", "BTCUSDT", hit, "Línea", plan as never);
      expect(message.title).toBe("Alerta del gráfico");
      expect(alertText(message)).toBe(
        'BTCUSDT cruzó por encima de Línea en 100\nPlan: activa "Reclaim" (largo), objetivo 108, invalidado por debajo de 97.',
      );
    } finally {
      setActiveLocale("en");
    }
    expect(lineAlert("a", "BTCUSDT", hit, "Line", plan as never).title).toBe("Chart alert");
  });
});
