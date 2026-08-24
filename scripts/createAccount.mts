/**
 * Creates one bookmaker account and prints its access code.
 *
 *   node scripts/createAccount.mts "Bet365"
 *   node scripts/createAccount.mts "Betano" --bankroll 200
 *
 * .mts, so Node treats it as ESM without a "type" field in package.json. Node 22+
 * strips the types on the fly; no build step, no tsx.
 *
 * The code is shown exactly once and only its scrypt hash is stored. There is no
 * recovery: lose it and the account has to be given a new one.
 *
 * Imports are relative, not "@/...": Node's type stripping does not read
 * tsconfig.json paths, so the aliases would not resolve here.
 */

import fs from "node:fs";
import dotenv from "dotenv";

// Vitest and plain Node do not load .env the way Next does, so populate it by hand.
// dotenv.parse, not dotenv.config — config() prints a banner to stdout.
Object.assign(process.env, dotenv.parse(fs.readFileSync(".env")));

const { PrismaClient } = await import("../src/generated/prisma/client.ts");
const { PrismaNeon } = await import("@prisma/adapter-neon");
const { generateCode, hashCode } = await import("../src/lib/auth/codes.ts");

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const bankrollFlag = args.indexOf("--bankroll");
const startingBalance = bankrollFlag >= 0 ? Number(args[bankrollFlag + 1]) : null;

if (!name) {
  console.error('Uso: node scripts/createAccount.mts "Bet365" [--bankroll 200]');
  process.exit(1);
}
if (startingBalance !== null && !Number.isFinite(startingBalance)) {
  console.error("--bankroll necesita un número.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL en .env.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

const code = generateCode();
const codeHash = await hashCode(code);

try {
  const account = await prisma.account.create({ data: { name, codeHash } });

  if (startingBalance !== null) {
    await prisma.bankroll.create({ data: { accountId: account.id, startingBalance } });
  }

  console.log("");
  console.log(`Cuenta creada: ${account.name}`);
  console.log(`Código de acceso: ${code}`);
  console.log("");
  console.log("Guárdalo ahora — solo se guarda su hash y no se puede recuperar.");
  if (startingBalance !== null) console.log(`Banca inicial: ${startingBalance}`);
  console.log("");
} catch (err) {
  if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
    console.error(`Ya existe una cuenta llamada "${name}".`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
