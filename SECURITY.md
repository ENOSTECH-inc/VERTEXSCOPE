# セキュリティポリシー

## このツールの前提

VERTEXSCOPE は**ローカル実行前提**のツールです。バックエンドはあなたの Google Cloud
認証情報（ADC またはサービスアカウントキー）を保持し、それを使って Discovery Engine API
と Cloud Storage にアクセスします。

つまり **バックエンドのポートに到達できる人は、あなたの権限で Vertex AI Search を操作できます。**
認証機構は同梱していません。信頼できないネットワークに公開しないでください。

## 実装している防御

| 対策 | 内容 |
| --- | --- |
| ループバック束縛 | 既定で `127.0.0.1` にのみ bind。他アドレスを指定すると警告を出す |
| CORS 制限 | 既定でループバックのオリジンのみ許可。`Access-Control-Allow-Credentials` は無効 |
| Host ヘッダ検証 | 既知のローカルホスト名以外の `Host` を 421 で拒否（DNS リバインディング対策） |
| SSRF 対策 | ドキュメントプレビューの中継先を Cloud Storage (`gs://` / `storage.googleapis.com`) のみに制限。リダイレクト追従も無効 |
| レスポンス無害化 | 中継したファイルに `X-Content-Type-Options: nosniff` を付与。HTML/SVG/XML には `Content-Security-Policy: sandbox` を付与 |
| XSS 対策 | 生成回答・要約・スニペットは DOMPurify でサニタイズしてから描画。HTML プレビューは `sandbox=""` の iframe |
| リソース名検証 | 削除・取得系はリソース名の形をサーバ側で検証してから API に渡す |
| 非 root 実行 | コンテナは uid 10001 の非特権ユーザーで動作 |
| 認証情報の非保存 | 設定ファイルに保存するのは鍵の**パス**のみ。鍵の中身は保存しない（`~/.vertexscope/config.json`, パーミッション 0600） |

## データの流れ

「会話」モードは、検索でヒットした資料の Cloud Storage URI を Vertex AI Gemini に渡し、
**Gemini が資料の中身を読んだうえで**回答を生成します。

- 送信先はあなたと同じ GCP プロジェクト内の Vertex AI です。第三者のサービスには送りません。
- ただし資料の内容がモデルに渡ることに変わりはないため、機微な文書を扱う場合は
  組織のデータ取り扱いポリシーを確認してください。
- 「検索」モードと一覧・プレビュー機能は Gemini を経由しません。

## 安全に使うために

- **ポートを公開しない。** `docker-compose.yml` は既定で `127.0.0.1` にのみバインドします。
  変更する場合は、前段にリバースプロキシと認証を必ず置いてください。
- **最小権限のアカウントを使う。** 閲覧だけで十分なら
  `roles/discoveryengine.viewer` と、プレビュー用に対象バケットの
  `roles/storage.objectViewer` で足ります。削除や取り込みを行う場合のみ
  `roles/discoveryengine.editor` を付けてください。
- **サービスアカウントキーはリポジトリに置かない。** `.gitignore` で
  `*-service-account*.json` などを無視していますが、`secrets/` のような
  リポジトリ外のディレクトリに置くことを推奨します。
- **削除操作は取り消せません。** ドキュメントの削除・一括削除、`FULL` モードの
  取り込みは元に戻せません。

## 脆弱性の報告

セキュリティ上の問題を見つけた場合は、**public issue を立てないでください。**

GitHub の [Security Advisories](https://github.com/ENOSTECH-inc/VERTEXSCOPE/security/advisories/new)
から非公開で報告してください。5 営業日以内に一次回答します。

## 既知の注意点

- 依存関係の `react-router` に RSC モード向けの CSRF 勧告
  ([GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2))
  がありますが、本アプリはサーバ機能を持たない純粋なクライアント SPA として
  利用しており、該当する RSC / Server Action の経路は存在しません。
