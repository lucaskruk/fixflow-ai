import {
  repairEventSchema,
  repairSchema,
  type CreateRepairEventInput,
  type CreateRepairInput,
  type Repair,
  type RepairEvent,
  type UpdateRepairInput,
} from "../src/domain/schemas";

type RepairRow = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  brand: string;
  model: string;
  serial_number: string | null;
  reported_issue: string;
  accessories: string;
  status: string;
  diagnosis: string | null;
  solution: string | null;
  created_at: string;
  updated_at: string;
};

type RepairEventRow = {
  id: string;
  repair_id: string;
  type: string;
  content: string;
  created_at: string;
};

const SELECT_REPAIR = `
  SELECT id, customer_name, customer_phone, brand, model, serial_number,
         reported_issue, accessories, status, diagnosis, solution,
         created_at, updated_at
  FROM repairs`;

function parseAccessories(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Stored repair accessories are not valid JSON");
  }
}

function mapRepair(row: RepairRow): Repair {
  return repairSchema.parse({
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    reportedIssue: row.reported_issue,
    accessories: parseAccessories(row.accessories),
    status: row.status,
    diagnosis: row.diagnosis,
    solution: row.solution,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapEvent(row: RepairEventRow): RepairEvent {
  return repairEventSchema.parse({
    id: row.id,
    repairId: row.repair_id,
    type: row.type,
    content: row.content,
    createdAt: row.created_at,
  });
}

const updateColumns: Record<keyof UpdateRepairInput, string> = {
  customerName: "customer_name",
  customerPhone: "customer_phone",
  brand: "brand",
  model: "model",
  serialNumber: "serial_number",
  reportedIssue: "reported_issue",
  accessories: "accessories",
  status: "status",
  diagnosis: "diagnosis",
  solution: "solution",
};

export class RepairRepository {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<Repair[]> {
    const result = await this.db
      .prepare(`${SELECT_REPAIR} ORDER BY updated_at DESC, id DESC`)
      .all<RepairRow>();
    return result.results.map(mapRepair);
  }

  async get(id: string): Promise<Repair | null> {
    const row = await this.db
      .prepare(`${SELECT_REPAIR} WHERE id = ?`)
      .bind(id)
      .first<RepairRow>();
    return row ? mapRepair(row) : null;
  }

  async create(input: CreateRepairInput): Promise<Repair> {
    const id = `FF-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO repairs (
          id, customer_name, customer_phone, brand, model, serial_number,
          reported_issue, accessories, status, diagnosis, solution,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`)
      .bind(
        id,
        input.customerName,
        input.customerPhone,
        input.brand,
        input.model,
        input.serialNumber,
        input.reportedIssue,
        JSON.stringify(input.accessories),
        input.status,
        now,
        now,
      )
      .run();
    const created = await this.get(id);
    if (!created) throw new Error("Created repair could not be read back");
    return created;
  }

  async update(id: string, input: UpdateRepairInput): Promise<Repair | null> {
    if (!(await this.get(id))) return null;

    const fields = Object.entries(input) as [keyof UpdateRepairInput, unknown][];
    const assignments = fields.map(([key]) => `${updateColumns[key]} = ?`);
    const values = fields.map(([key, value]) =>
      key === "accessories" ? JSON.stringify(value) : value,
    );
    const now = new Date().toISOString();
    await this.db
      .prepare(`UPDATE repairs SET ${assignments.join(", ")}, updated_at = ? WHERE id = ?`)
      .bind(...values, now, id)
      .run();
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM repairs WHERE id = ?")
      .bind(id)
      .run();
    return result.meta.changes > 0;
  }

  async listEvents(repairId: string): Promise<RepairEvent[] | null> {
    if (!(await this.get(repairId))) return null;
    const result = await this.db
      .prepare(`
        SELECT id, repair_id, type, content, created_at
        FROM repair_events
        WHERE repair_id = ?
        ORDER BY created_at ASC, id ASC`)
      .bind(repairId)
      .all<RepairEventRow>();
    return result.results.map(mapEvent);
  }

  async addEvent(
    repairId: string,
    input: CreateRepairEventInput,
  ): Promise<RepairEvent | null> {
    if (!(await this.get(repairId))) return null;
    const id = `EV-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`
          INSERT INTO repair_events (id, repair_id, type, content, created_at)
          VALUES (?, ?, ?, ?, ?)`)
        .bind(id, repairId, input.type, input.content, now),
      this.db
        .prepare("UPDATE repairs SET updated_at = ? WHERE id = ?")
        .bind(now, repairId),
    ]);
    const row = await this.db
      .prepare(`
        SELECT id, repair_id, type, content, created_at
        FROM repair_events WHERE id = ?`)
      .bind(id)
      .first<RepairEventRow>();
    if (!row) throw new Error("Created event could not be read back");
    return mapEvent(row);
  }
}
