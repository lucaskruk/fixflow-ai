import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { KnowledgeDocument } from "../domain/schemas";
import {
  getKnowledgeRetrievalPreviewDocuments,
  KnowledgeCitationList,
  KnowledgeRetrievalPreview,
} from "./KnowledgeRetrievalPreview";

function document(id: string, status: KnowledgeDocument["status"] = "published"): KnowledgeDocument {
  return {
    id,
    title: `Documento ${id}`,
    tags: [`tag-${id}`],
    content: `Contenido ${id}`,
    sources: [`Manual ${id}`],
    status,
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z",
  };
}

describe("knowledge retrieval preview", () => {
  it("keeps the deterministic engine order, excludes drafts, and shows at most three", () => {
    const input = [
      document("third"),
      document("draft", "draft"),
      document("first"),
      document("second"),
      document("fourth"),
    ];

    expect(getKnowledgeRetrievalPreviewDocuments(input).map(({ id }) => id)).toEqual([
      "third",
      "first",
      "second",
    ]);
    expect(getKnowledgeRetrievalPreviewDocuments(input).map(({ id }) => id)).toEqual([
      "third",
      "first",
      "second",
    ]);
  });

  it("renders retrieved documents and model citations as explicitly different relations", () => {
    const documents = [document("power-sequence")];
    const retrievedMarkup = renderToStaticMarkup(createElement(KnowledgeRetrievalPreview, {
      documents,
      onRefresh: () => undefined,
      refreshing: false,
      error: null,
      message: null,
    }));
    const citedMarkup = renderToStaticMarkup(createElement(KnowledgeCitationList, {
      sourceIds: ["power-sequence"],
      documents,
    }));

    expect(retrievedMarkup).toContain('data-knowledge-relation="retrieved"');
    expect(retrievedMarkup).toContain("Documentos recuperados para el análisis");
    expect(retrievedMarkup).toContain("Recuperado no significa citado");
    expect(citedMarkup).toContain('data-knowledge-relation="cited"');
    expect(citedMarkup).toContain("Fuentes citadas por el modelo");
    expect(citedMarkup).not.toContain('data-knowledge-relation="retrieved"');
  });

  it("preserves retrieval order in the rendered list", () => {
    const markup = renderToStaticMarkup(createElement(KnowledgeRetrievalPreview, {
      documents: [document("zeta"), document("alpha"), document("beta")],
      onRefresh: () => undefined,
      refreshing: false,
      error: null,
      message: null,
    }));

    expect(markup.indexOf("zeta")).toBeLessThan(markup.indexOf("alpha"));
    expect(markup.indexOf("alpha")).toBeLessThan(markup.indexOf("beta"));
  });
});
