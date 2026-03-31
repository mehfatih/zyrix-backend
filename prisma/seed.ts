// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Prisma Seed (Chat 2 Updated)
// ─────────────────────────────────────────────────────────────

import { PrismaClient, TransactionStatus, PaymentMethod } from "@prisma/client";

const prisma = new PrismaClient();

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function randomDate(maxDaysAgo: number): Date {
  return daysAgo(randomBetween(0, maxDaysAgo));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const STATUSES: TransactionStatus[] = ["SUCCESS", "SUCCESS", "SUCCESS", "PENDING", "FAILED"];
const METHODS: PaymentMethod[] = ["CREDIT_CARD", "BANK_TRANSFER", "DIGITAL_WALLET", "CRYPTO"];

const CUSTOMERS = [
  { name: "Ahmed Al-Rashid", email: "ahmed@example.com", phone: "+966501234567", country: "SA", flag: "🇸🇦" },
  { name: "Mehmet Yilmaz", email: "mehmet@example.com", phone: "+905321234567", country: "TR", flag: "🇹🇷" },
  { name: "Fatima Hassan", email: "fatima@example.com", phone: "+971501234567", country: "AE", flag: "🇦🇪" },
  { name: "Omar Abdullah", email: "omar@example.com", phone: "+96551234567", country: "KW", flag: "🇰🇼" },
  { name: "Sara Al-Qatari", email: "sara@example.com", phone: "+97451234567", country: "QA", flag: "🇶🇦" },
  { name: "Elif Demir", email: "elif@example.com", phone: "+905411234567", country: "TR", flag: "🇹🇷" },
  { name: "Khalid bin Sultan", email: "khalid@example.com", phone: "+966551234567", country: "SA", flag: "🇸🇦" },
  { name: "Amina Bakr", email: "amina@example.com", phone: "+971521234567", country: "AE", flag: "🇦🇪" },
  { name: "Tariq Mohammed", email: "tariq@example.com", phone: "+966591234567", country: "SA", flag: "🇸🇦" },
  { name: "Zeynep Kaya", email: "zeynep@example.com", phone: "+905301234567", country: "TR", flag: "🇹🇷" },
  { name: "Nour Al-Din", email: "nour@example.com", phone: "+96241234567", country: "JO", flag: "🇯🇴" },
  { name: "Burak Çelik", email: "burak@example.com", phone: "+905551234567", country: "TR", flag: "🇹🇷" },
  { name: "Rania Khalil", email: "rania@example.com", phone: "+96171234567", country: "LB", flag: "🇱🇧" },
  { name: "Hassan Youssef", email: "hassan@example.com", phone: "+201001234567", country: "EG", flag: "🇪🇬" },
  { name: "Layla Ibrahim", email: "layla@example.com", phone: "+966521234567", country: "SA", flag: "🇸🇦" },
];

async function main() {
  console.log("🌱 Seeding database...");

  await prisma.notification.deleteMany();
  await prisma.paymentLink.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.revenueGoal.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.merchant.deleteMany();

  console.log("🗑️  Cleaned existing data");

  const merchant = await prisma.merchant.create({
    data: {
      name: "Zyrix Demo Merchant",
      email: "demo@zyrix.io",
      phone: "+905001234567",
      merchantId: "ZRX-00001",
      language: "EN",
      currency: "SAR",
      status: "ACTIVE",
      kycStatus: "VERIFIED",
      businessName: "Zyrix Technologies Ltd.",
      businessType: "E-Commerce",
      country: "TR",
      timezone: "Europe/Istanbul",
      onboardingDone: true,
    },
  });

  console.log(`✅ Merchant created: ${merchant.merchantId}`);

  // 60 transactions
  const transactions = [];
  for (let i = 1; i <= 60; i++) {
    const customer = pick(CUSTOMERS);
    const status = pick(STATUSES);
    const method = pick(METHODS);
    const amount = parseFloat(randomBetween(50, 15000).toFixed(2));
    const date = randomDate(365);
    const txnDate = date.toISOString().slice(0, 10).replace(/-/g, "");
    const txId = `TXN-${txnDate}-${String(i).padStart(3, "0")}`;

    transactions.push({
      merchantId: merchant.id,
      transactionId: txId,
      amount,
      currency: "SAR",
      status,
      method,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      country: customer.country,
      flag: customer.flag,
      isCredit: status === "SUCCESS",
      description: `Payment for order #ORD-${1000 + i}`,
      createdAt: date,
      updatedAt: date,
    });
  }

  await prisma.transaction.createMany({ data: transactions });
  console.log(`✅ Created ${transactions.length} transactions`);

  const createdTx = await prisma.transaction.findMany({
    where: { merchantId: merchant.id, status: "SUCCESS" },
    take: 3,
    orderBy: { createdAt: "desc" },
  });

  if (createdTx.length >= 2) {
    await prisma.dispute.createMany({
      data: [
        {
          merchantId: merchant.id,
          transactionId: createdTx[0].id,
          disputeId: "DSP-00001",
          reason: "Customer did not receive goods",
          amount: createdTx[0].amount,
          currency: "SAR",
          status: "OPEN",
          createdAt: daysAgo(3),
        },
        {
          merchantId: merchant.id,
          transactionId: createdTx[1].id,
          disputeId: "DSP-00002",
          reason: "Duplicate charge",
          amount: createdTx[1].amount,
          currency: "SAR",
          status: "UNDER_REVIEW",
          createdAt: daysAgo(7),
        },
      ],
    });
    console.log("✅ Created 2 disputes (open)");
  }

  await prisma.settlement.createMany({
    data: [
      {
        merchantId: merchant.id,
        settlementId: "STL-00001",
        amount: 45200.0,
        commission: 1356.0,
        netAmount: 43844.0,
        currency: "SAR",
        status: "COMPLETED",
        bankName: "Saudi National Bank",
        bankAccount: "****4521",
        scheduledDate: daysAgo(30),
        completedDate: daysAgo(28),
        createdAt: daysAgo(32),
      },
      {
        merchantId: merchant.id,
        settlementId: "STL-00002",
        amount: 32800.0,
        commission: 984.0,
        netAmount: 31816.0,
        currency: "SAR",
        status: "COMPLETED",
        bankName: "Saudi National Bank",
        bankAccount: "****4521",
        scheduledDate: daysAgo(15),
        completedDate: daysAgo(13),
        createdAt: daysAgo(17),
      },
      {
        merchantId: merchant.id,
        settlementId: "STL-00003",
        amount: 12500.0,
        commission: 375.0,
        netAmount: 12125.0,
        currency: "SAR",
        status: "SCHEDULED",
        bankName: "Saudi National Bank",
        bankAccount: "****4521",
        scheduledDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(2),
      },
    ],
  });
  console.log("✅ Created 3 settlements");

  await prisma.invoice.createMany({
    data: [
      {
        merchantId: merchant.id,
        invoiceId: "INV-00001",
        customerName: "Ahmed Al-Rashid",
        total: 5500.0,
        currency: "SAR",
        status: "PAID",
        items: [{ name: "Web Development", quantity: 1, price: 5000 }, { name: "Hosting (annual)", quantity: 1, price: 500 }],
        dueDate: daysAgo(10),
        paidDate: daysAgo(8),
        createdAt: daysAgo(20),
      },
      {
        merchantId: merchant.id,
        invoiceId: "INV-00002",
        customerName: "Mehmet Yilmaz",
        total: 2200.0,
        currency: "SAR",
        status: "SENT",
        items: [{ name: "Consulting Services", quantity: 4, price: 550 }],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(5),
      },
      {
        merchantId: merchant.id,
        invoiceId: "INV-00003",
        customerName: "Fatima Hassan",
        total: 800.0,
        currency: "SAR",
        status: "OVERDUE",
        items: [{ name: "Design Package", quantity: 1, price: 800 }],
        dueDate: daysAgo(5),
        createdAt: daysAgo(20),
      },
    ],
  });
  console.log("✅ Created 3 invoices");

  await prisma.expense.createMany({
    data: [
      { merchantId: merchant.id, category: "software", description: "AWS hosting", amount: 1200, currency: "SAR", date: daysAgo(5) },
      { merchantId: merchant.id, category: "marketing", description: "Google Ads", amount: 3500, currency: "SAR", date: daysAgo(10) },
      { merchantId: merchant.id, category: "office", description: "Office rent", amount: 8000, currency: "SAR", date: daysAgo(15) },
      { merchantId: merchant.id, category: "software", description: "Figma subscription", amount: 200, currency: "SAR", date: daysAgo(20) },
      { merchantId: merchant.id, category: "marketing", description: "Social media ads", amount: 1800, currency: "SAR", date: daysAgo(25) },
    ],
  });
  console.log("✅ Created 5 expenses");

  await prisma.revenueGoal.createMany({
    data: [
      {
        merchantId: merchant.id,
        name: "Q1 Revenue Target",
        targetAmount: 500000,
        currentAmount: 325750,
        currency: "SAR",
        period: "QUARTERLY",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-03-31"),
      },
      {
        merchantId: merchant.id,
        name: "Monthly Sales Goal",
        targetAmount: 150000,
        currentAmount: 98200,
        currency: "SAR",
        period: "MONTHLY",
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
      },
    ],
  });
  console.log("✅ Created 2 revenue goals");

  await prisma.subscription.create({
    data: {
      merchantId: merchant.id,
      planName: "Zyrix Pro",
      amount: 299,
      currency: "SAR",
      interval: "MONTHLY",
      status: "ACTIVE",
      currentPeriodStart: daysAgo(5),
      currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("✅ Created 1 subscription");

  await prisma.paymentLink.createMany({
    data: [
      {
        merchantId: merchant.id,
        linkId: "PL-00001",
        title: "Premium Package",
        amount: 1500,
        currency: "SAR",
        url: "https://pay.zyrix.io/PL-00001",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usageCount: 12,
        createdAt: daysAgo(10),
      },
      {
        merchantId: merchant.id,
        linkId: "PL-00002",
        title: "Basic Service",
        amount: 500,
        currency: "SAR",
        url: "https://pay.zyrix.io/PL-00002",
        status: "ACTIVE",
        usageCount: 34,
        createdAt: daysAgo(20),
      },
    ],
  });
  console.log("✅ Created 2 payment links");

  await prisma.notification.createMany({
    data: [
      { merchantId: merchant.id, title: "New Payment Received", body: "You received a payment of SAR 1,250.00 from Ahmed Al-Rashid", type: "PAYMENT", isRead: false, createdAt: daysAgo(0) },
      { merchantId: merchant.id, title: "Settlement Scheduled", body: "Your settlement of SAR 12,125.00 is scheduled for next week", type: "SETTLEMENT", isRead: false, createdAt: daysAgo(1) },
      { merchantId: merchant.id, title: "New Dispute Opened", body: "A dispute has been opened for transaction DSP-00001", type: "DISPUTE", isRead: false, createdAt: daysAgo(3) },
      { merchantId: merchant.id, title: "Security Alert", body: "A new login was detected from Istanbul, Turkey", type: "SECURITY", isRead: false, createdAt: daysAgo(4) },
      { merchantId: merchant.id, title: "System Maintenance", body: "Scheduled maintenance on Jan 25 from 2:00 AM to 4:00 AM UTC", type: "SYSTEM", isRead: false, createdAt: daysAgo(5) },
      { merchantId: merchant.id, title: "Payment Failed", body: "A payment of SAR 800.00 failed due to insufficient funds", type: "PAYMENT", isRead: true, createdAt: daysAgo(7) },
    ],
  });
  console.log("✅ Created 6 notifications (5 unread)");

  const txCount = await prisma.transaction.count({ where: { merchantId: merchant.id } });
  console.log(`\n🎉 Seed completed!`);
  console.log(`   Merchant ID:  ${merchant.merchantId}`);
  console.log(`   Phone:        ${merchant.phone}`);
  console.log(`   Transactions: ${txCount}`);
  console.log(`\n   Login with POST /api/auth/send-otp → { "phone": "${merchant.phone}" }`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
