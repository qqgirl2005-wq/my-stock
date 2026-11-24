import "server-only";
import mongoose from "mongoose";

// 開發模式下熱重載會重新執行模組，把連線存在 globalThis 才不會每次存檔都開新連線
const globalForMongoose = globalThis as unknown as { mongoosePromise?: Promise<typeof mongoose> };

export function connectDb(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("缺少環境變數 MONGODB_URI，請在 .env.local 設定後重啟 server");

  if (!globalForMongoose.mongoosePromise) {
    globalForMongoose.mongoosePromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10_000 })
      .catch((err) => {
        // 連線失敗就清掉，下一次請求才會重試
        globalForMongoose.mongoosePromise = undefined;
        throw err;
      });
  }
  return globalForMongoose.mongoosePromise;
}
