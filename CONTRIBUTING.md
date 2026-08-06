# コントリビュートガイド

VERTEXSCOPE への貢献を歓迎します。

## 開発環境

必要なもの: Node.js 20+ / Python 3.11+（Docker があればビルド確認も可能）

```bash
# バックエンド (http://127.0.0.1:8765)
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py

# フロントエンド (http://localhost:3000)
npm install
npm run dev
```

`VERTEXSCOPE_CONFIG_DIR` を指定すると、個人の設定を汚さずに試せます。

```bash
VERTEXSCOPE_CONFIG_DIR=/tmp/vertexscope-dev python main.py
```

## 送る前に

```bash
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint
npm run build       # 本番ビルドが通るか
docker compose build
```

## コードの流儀

- **TypeScript は strict、`any` 禁止。** 外部 API のレスポンスは `unknown` で受け、
  `src/api/parse.ts` のヘルパで畳んでから型を付けます。
- **状態は Zustand の store に集約する。** コンポーネントから直接 `fetch` しません。
  API 呼び出しは `src/api/client.ts` を経由させます。
- **UI プリミティブは `src/components/ui/` に置く。** 外部コンポーネント
  ライブラリは増やさない方針です。
- **外部由来の文字列を `dangerouslySetInnerHTML` に渡さない。** 生成回答や
  スニペットは必ず `src/lib/markdown.ts` のサニタイズを通します。
- **コメントは「なぜ」を書く。** 何をしているかはコードから読めます。
- ユーザー向けの文言は日本語、コード内の識別子は英語です。

## セキュリティに関わる変更

以下に触れる変更は、PR の説明で意図と影響範囲を明記してください。

- CORS / `Host` ヘッダ / bind アドレスの扱い（`server/main.py`）
- プレビュー中継の許可先（`server/services/discovery_engine.py` の
  `ALLOWED_OBJECT_HOSTS`, `parse_object_uri`）
- レスポンスヘッダ（`server/api/vertex.py` の `api_preview`）
- サニタイズ処理（`src/lib/markdown.ts`）

脆弱性そのものの報告は Issue ではなく [SECURITY.md](./SECURITY.md) の手順でお願いします。

## Pull Request

1. ブランチを切る（`feat/...`, `fix/...`）
2. 変更は目的ごとに分ける
3. 上記のチェックを通す
4. 動作確認した内容を PR に書く（実データで確認した場合はその旨だけで結構です。
   プロジェクト ID などは伏せてください）

## ライセンス

コントリビュートされたコードは [Apache License 2.0](./LICENSE) で公開されます。
