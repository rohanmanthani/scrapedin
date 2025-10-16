import { resolveMx } from "node:dns/promises";
import net from "node:net";

const SMTP_PORT = 25;
const SOCKET_TIMEOUT_MS = 5000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseResponseCode = (response: string): number | undefined => {
  const match = response.match(/^(\d{3})/);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[1] ?? "", 10);
};

const probeMxHost = (host: string, email: string): Promise<"valid" | "invalid" | "unknown"> =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port: SMTP_PORT });

    const done = (result: "valid" | "invalid" | "unknown") => {
      socket.removeAllListeners();
      if (!socket.destroyed) {
        socket.end();
      }
      resolve(result);
    };

    socket.setTimeout(SOCKET_TIMEOUT_MS, () => {
      done("unknown");
    });

    const commands = [
      { cmd: "HELO linkedin-scraper.local", expect: [250] },
      { cmd: "MAIL FROM:<verify@linkedin-scraper.local>", expect: [250, 251] },
      { cmd: `RCPT TO:<${email}>`, expect: [250, 251, 252] }
    ];

    let stage = -1;

    socket.on("data", async (data: Buffer) => {
      const response = data.toString("utf-8");
      const code = parseResponseCode(response);

      // Initial banner
      if (stage === -1) {
        stage = 0;
        await delay(50);
        socket.write(`${commands[stage].cmd}\r\n`, "utf-8");
        return;
      }

      const current = commands[stage];
      if (!code || !current) {
        done("unknown");
        return;
      }

      if (stage === commands.length - 1) {
        if (current.expect.includes(code)) {
          done("valid");
        } else if (code >= 500 && code < 600) {
          done("invalid");
        } else {
          done("unknown");
        }
        return;
      }

      if (!current.expect.includes(code)) {
        done(code >= 500 && code < 600 ? "invalid" : "unknown");
        return;
      }

      stage += 1;
      const next = commands[stage];
      if (!next) {
        done("unknown");
        return;
      }
      socket.write(`${next.cmd}\r\n`, "utf-8");
    });

    socket.on("error", () => {
      done("unknown");
    });
  });

export const verifyEmailAddress = async (email: string): Promise<"valid" | "invalid" | "unknown"> => {
  const [, domain] = email.split("@");
  if (!domain) {
    return "unknown";
  }

  let records;
  try {
    records = await resolveMx(domain);
  } catch {
    return "unknown";
  }

  if (!records?.length) {
    return "unknown";
  }

  const sorted = [...records].sort((a, b) => a.priority - b.priority);
  for (const record of sorted) {
    try {
      const result = await probeMxHost(record.exchange, email);
      if (result !== "unknown") {
        return result;
      }
    } catch {
      // Try the next record
    }
  }

  return "unknown";
};
