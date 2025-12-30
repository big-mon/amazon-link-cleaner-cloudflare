# amazon-link-cleaner-cloudflare

Cloudflare Pages + Pages Functions で Amazon リンクの短縮URL展開とクリーン化を行うミニツールです。

## できること
- 短縮URL（amzn.to など）を最大5回まで展開
- Amazon URL の追跡系パラメータを削除し、可能なら `https://{host}/dp/{ASIN}` に正規化
- 展開後URL、クリーンURL、ASIN、除去したパラメータを表示＆コピー

## 使い方
1. Cloudflare Pages へデプロイする（下記参照）。
2. 画面に URL を貼り付けて「展開してクリーン化」を実行。

## ローカル実行
Cloudflare Wrangler を使って Pages + Functions をローカルで起動します。

```
npm install -g wrangler
wrangler pages dev public --functions=functions --compatibility-date=2024-01-01
```

起動後、`http://localhost:8788` にアクセスします。

## デプロイ手順（Cloudflare Pages）
1. Cloudflare Pages で新しいプロジェクトを作成し、このリポジトリを接続。
2. Build command は空欄（または `npm run build` 等を使わない）に設定。
3. Output directory を `public` に設定。
4. デプロイすると `/api/clean` とフロントが同一ドメインで動作します。

## セキュリティ・仕様
- http/https のみ許可
- `localhost` / `127.*` / `0.0.0.0` / `::1` などのホストは拒否
- 最大リダイレクト回数は5回
- 1回のフェッチは8秒でタイムアウト
- 最終URLが Amazon ドメインでない場合はエラー
- API は同一オリジンのブラウザリクエストのみ許可
