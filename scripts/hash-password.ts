import { hashPassword } from "../server/_core/password";

const plain = process.argv[2];

if (!plain) {
  console.error("Usage: pnpm hash:password <plain-password>");
  process.exit(1);
}

console.log(hashPassword(plain));
