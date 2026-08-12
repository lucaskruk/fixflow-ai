import {
  knowledgeDocumentSchema,
  type CreateKnowledgeDocumentInput,
  type KnowledgeDocument,
  type ListKnowledgeDocumentsInput,
  type UpdateKnowledgeDocumentInput,
} from "../src/domain/schemas";

type KnowledgeDocumentRow = {
  id: string;
  title: string;
  tags: string;
  content: string;
  sources: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const SELECT_DOCUMENT = `
  SELECT id, title, tags, content, sources, status, created_at, updated_at
  FROM knowledge_documents`;

function parseStringArray(value: string, field: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Stored knowledge document ${field} are not valid JSON`);
  }
}

function mapDocument(row: KnowledgeDocumentRow): KnowledgeDocument {
  return knowledgeDocumentSchema.parse({
    id: row.id,
    title: row.title,
    tags: parseStringArray(row.tags, "tags"),
    content: row.content,
    sources: parseStringArray(row.sources, "sources"),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export class KnowledgeRepository {
  constructor(private readonly db: D1Database) {}

  async list(filters: ListKnowledgeDocumentsInput = {}): Promise<KnowledgeDocument[]> {
    const result = await this.db
      .prepare(`${SELECT_DOCUMENT} ORDER BY title COLLATE NOCASE ASC, id ASC`)
      .all<KnowledgeDocumentRow>();
    const documents = result.results.map(mapDocument);
    const query = filters.q ? normalize(filters.q) : null;

    return documents.filter((document) => {
      if (filters.status && document.status !== filters.status) return false;
      if (filters.tag && !document.tags.includes(filters.tag)) return false;
      if (!query) return true;
      return normalize([
        document.id,
        document.title,
        document.content,
        ...document.tags,
        ...document.sources,
      ].join("\n")).includes(query);
    });
  }

  async get(id: string): Promise<KnowledgeDocument | null> {
    const row = await this.db
      .prepare(`${SELECT_DOCUMENT} WHERE id = ?`)
      .bind(id)
      .first<KnowledgeDocumentRow>();
    return row ? mapDocument(row) : null;
  }

  async create(input: CreateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO knowledge_documents (
          id, title, tags, content, sources, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        input.id,
        input.title,
        JSON.stringify(input.tags),
        input.content,
        JSON.stringify(input.sources),
        input.status,
        now,
        now,
      )
      .run();
    const created = await this.get(input.id);
    if (!created) throw new Error("Created knowledge document could not be read back");
    return created;
  }

  async update(
    id: string,
    input: UpdateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument | null> {
    if (!(await this.get(id))) return null;

    const columns: Record<keyof UpdateKnowledgeDocumentInput, string> = {
      title: "title",
      tags: "tags",
      content: "content",
      sources: "sources",
      status: "status",
    };
    const entries = Object.entries(input) as [
      keyof UpdateKnowledgeDocumentInput,
      unknown,
    ][];
    const values = entries.map(([key, value]) =>
      key === "tags" || key === "sources" ? JSON.stringify(value) : value,
    );
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE knowledge_documents SET ${entries
          .map(([key]) => `${columns[key]} = ?`)
          .join(", ")}, updated_at = ? WHERE id = ?`,
      )
      .bind(...values, now, id)
      .run();
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM knowledge_documents WHERE id = ?")
      .bind(id)
      .run();
    return result.meta.changes > 0;
  }
}
