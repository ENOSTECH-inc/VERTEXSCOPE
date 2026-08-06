<div align="center">

# VERTEXSCOPE

### Vertex AI Search のデータストアを、見て・試して・直せるローカルコンソール

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/docker--compose-ready-2496ed.svg)](./docker-compose.yml)

</div>

---

## これは何か

Vertex AI Search（Discovery Engine）は強力ですが、**中身の点検が驚くほど面倒**です。

- データストアに何件入っているのか、Cloud Console からは一目で分からない
- ドキュメント一覧は出るが、**元ファイルの中身は確認できない**。GCS の URI を
  コピーして、別タブでバケットを開いて、探して、ダウンロードして……
- 検索の効き具合を試したいだけなのに、毎回 API クライアントを書くことになる
- リクエスト/レスポンスの生 JSON を見たいのに、どこにも出てこない

VERTEXSCOPE は、この往復をひとつの画面に畳み込みます。**ローカルで立ち上げて、
自分の権限で、自分のデータストアを覗くためのツール**です。

## できること

### データストアの棚卸し
コレクション配下のデータストアを一覧し、**実際のドキュメント件数**まで集計します。
表示名・ID で絞り込み、件数や作成日時で並べ替えできます。

### ドキュメント一覧と「中身」のプレビュー
これが本命の機能です。ドキュメントを開くと **左にメタデータと生 JSON、右に実ファイルの
プレビュー**が並びます。MIME タイプに応じて表示を切り替えます。

| ファイル種別 | プレビュー |
| --- | --- |
| 画像 (JPEG/PNG/WebP/SVG…) | インライン表示 |
| PDF | ブラウザ内蔵ビューア（ページ送り・ズーム・印刷） |
| テキスト / Markdown / JSON / CSV | 整形表示 |
| HTML | スクリプト無効のサンドボックス内で描画 |
| 動画 / 音声 | インラインプレイヤー |
| その他 (xlsx 等) | ダウンロードリンク |

GCS 上のオブジェクトはバックエンドが認証付きで中継するので、**バケットを別途開く必要は
ありません**。

### 資料と会話する
「会話」モードでは、質問に対して **Discovery Engine で検索 → ヒットした資料の実体を
Vertex AI Gemini に読ませて回答** します。図面 PDF の寸法を聞けば、実際に PDF を
読んで答えます。回答には参照した資料の一覧が付き、本文を読めなかった資料
（xlsx などの非対応形式、インデックスに残っているが実体が消えたもの）も明示されます。

認証は Discovery Engine と共通の ADC をそのまま使うため、**API キーの管理は不要**です。

> Discovery Engine の `answer` API は Enterprise エディション + LLM アドオンが必須ですが、
> この「会話」モードは **Standard エディションのデータストアでも動きます**。

### 検索と answer API
`search`（素の検索）と `answer`（Discovery Engine の生成回答 API）も同じ画面から
実行できます。フィルター式、取得件数、プリアンブル、会話セッションの継続といった
パラメータを UI から調整でき、**参照元・引用箇所・関連質問**も確認できます。

### Debug ペイン
実行のたびにリクエスト/レスポンスの生 JSON と所要時間を記録します。
「なぜこの結果になったのか」を追うための情報が、常に 1 クリック先にあります。

### ドキュメントの削除・GCS からの取り込み
不要なドキュメントを個別・一括で削除できます。Cloud Storage の URI を指定して
取り込みオペレーションを開始することもできます。

---

## セットアップ

必要なもの: **Docker**（または Node.js 20+ と Python 3.11+）と、Vertex AI Search を
使っている GCP プロジェクトへのアクセス権。

### Docker Compose で起動する（推奨）

```bash
git clone https://github.com/ENOSTECH-inc/VERTEXSCOPE.git
cd VERTEXSCOPE
cp .env.example .env
```

ローカルの gcloud 認証をそのまま使う場合は、事前に一度だけ:

```bash
gcloud auth application-default login --project=YOUR_PROJECT_ID
```

あとは起動するだけです。

```bash
docker compose up -d
```

http://localhost:8080 を開き、画面上部の「接続設定」から GCP プロジェクトを設定します。
**Cloud Console のデータストア画面の URL を貼り付けると、プロジェクト・ロケーション・
コレクションが自動で入ります。**

### ローカル開発として起動する

バックエンドとフロントエンドを別々に立ち上げます。

```bash
# ターミナル 1: API サーバ (http://127.0.0.1:8765)
cd server
pip install -r requirements.txt
python main.py

# ターミナル 2: UI (http://localhost:3000)
npm install
npm run dev
```

Vite の dev server が `/api` を自動でバックエンドに転送するので、CORS の設定は不要です。

---

## 認証

2 通りに対応しています。どちらも UI の「接続設定」から切り替えられます。

**Application Default Credentials（既定）**
```bash
gcloud auth application-default login --project=YOUR_PROJECT_ID
```
Docker で動かす場合、`~/.config/gcloud` が読み取り専用でコンテナにマウントされます。

**サービスアカウントキー**

`docker-compose.yml` の `./secrets` マウントを有効にし、`.env` で
`GOOGLE_APPLICATION_CREDENTIALS=/secrets/your-key.json` を指定します。

### 必要なロール

| 用途 | ロール |
| --- | --- |
| データストア／ドキュメントの閲覧、検索 | `roles/discoveryengine.viewer` |
| 元ファイルのプレビュー | 対象バケットへの `roles/storage.objectViewer` |
| 削除・取り込み | `roles/discoveryengine.editor` |
| 「会話」モード | `roles/aiplatform.user`（Vertex AI API の有効化も必要） |

---

## 設定項目

すべて任意です。詳細は [.env.example](./.env.example) を参照してください。

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `VERTEXSCOPE_PORT` | `8080` | ホスト側の公開ポート |
| `VERTEXSCOPE_PROJECT_ID` | — | GCP プロジェクト ID（UI からも設定可） |
| `VERTEXSCOPE_LOCATION` | `global` | `global` / `us` / `eu` |
| `VERTEXSCOPE_COLLECTION` | `default_collection` | コレクション ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | サービスアカウントキーのパス |
| `VERTEXSCOPE_ALLOWED_ORIGINS` | ループバック | CORS で許可するオリジン |
| `VERTEXSCOPE_ALLOWED_HOSTS` | ローカルのみ | 受け付ける `Host` ヘッダ |
| `VERTEXSCOPE_MAX_PREVIEW_BYTES` | `67108864` | プレビュー中継の上限サイズ |

接続設定は `~/.vertexscope/config.json`（Docker では named volume）に保存されます。
保存されるのは鍵の**パス**だけで、認証情報そのものは保存しません。

---

## ⚠️ セキュリティ

**このバックエンドはあなたの Google Cloud 認証情報を持ちます。認証機構は同梱していません。**
ポートに到達できる人は、あなたの権限でデータストアを操作できます。

既定ではループバックにのみバインドし、CORS と `Host` ヘッダを制限し、ファイル中継先を
Cloud Storage に限定しています。ネットワークに公開する場合は、必ず前段に認証を置いて
ください。詳細は [SECURITY.md](./SECURITY.md) にまとめています。

---

## 制限事項

- **スニペット・抽出回答・要約、および `answer` API は Enterprise エディション限定**です。
  Standard エディションのデータストアでは、これらのオプションをオフにして検索するか、
  「会話」モードを使ってください（既定はどちらもその構成です）。
- **「会話」モードは資料の中身を Vertex AI Gemini に送ります。** 送信先は同じ GCP
  プロジェクト内の Vertex AI で、外部サービスには出ませんが、機微な資料を扱う場合は
  組織のポリシーを確認してください。
- Gemini が直接読めるのは PDF・画像・テキスト・音声・動画です。xlsx / docx などは
  題名のみが文脈として渡されます。
- ドキュメントの削除、`FULL` モードでの取り込みは**取り消せません**。
- ドキュメント件数の集計は 200 件で打ち切り、`200+` と表示します。

---

## 技術構成

```
React 19 + TypeScript + Vite + Tailwind CSS 4    ← src/
        │  (開発時は Vite proxy、本番は同一オリジン)
        ▼
FastAPI + google-auth                             ← server/
        │
        ├─→ discoveryengine.googleapis.com   検索・データストア操作
        ├─→ storage.googleapis.com           元ファイルの取得 (プレビュー / 会話)
        └─→ aiplatform.googleapis.com        Gemini による回答生成 (会話)
```

フレームワークロックインを避けるため、Next.js のようなメタフレームワークは使わず、
素の React SPA として構成しています。バックエンドはビルド済み UI の配信も兼ねるので、
本番は 1 コンテナで完結します。

---

## コントリビュート

Issue も Pull Request も歓迎します。[CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

## ライセンス

[Apache License 2.0](./LICENSE) — Copyright 2026 ENOSTECH, Inc.

本プロジェクトは Google LLC と提携・承認関係にありません。
"Google Cloud" および "Vertex AI Search" は Google LLC の商標です。
