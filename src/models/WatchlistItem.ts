import { type InferSchemaType, model, models, Schema, type Model } from "mongoose";

const watchlistItemSchema = new Schema(
  {
    stockId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true },
  },
  { timestamps: true },
);

export type WatchlistItemDoc = InferSchemaType<typeof watchlistItemSchema>;

// 熱重載時 model 已註冊過，重複呼叫 model() 會丟錯，所以先查 models
export const WatchlistItem: Model<WatchlistItemDoc> =
  (models.WatchlistItem as Model<WatchlistItemDoc>) ?? model("WatchlistItem", watchlistItemSchema);
