# Vercel発行キーの接続先を修正し、同じ48問を再試験

2026年10月7日（日本時間）。ユーザーから「Vercelで発行したキー」と説明を受け、Vercel AI Gateway経由で同じキーを試したところ、JevがHTTP200で正常回答した。これまでTypeSafeの直接APIへ送っていたことが401の原因だった。

**キーを再発行せず、接続先を合わせることで認証が成功した。** 以前の「キーが拒否された」説明はHTTP結果として正しいが、発行元と接続先の食い違いを見落としていた。TypeSafeの管理画面での確認より、Vercel経由の確認が必要なケースだった。

Vercel公式は、TypeSafe互換のベースURL `https://ai-gateway.vercel.sh/typesafe` とGateway認証を案内している。[Vercel公式のJev接続説明](https://vercel.com/i/jev-integrations)。今回、この互換経路を実際に呼び、型付きの回答とトークン使用量を確認した。

## 修正した内容

- `TYPESAFE_API_BASE_URL` でTypeSafe直接とVercel互換経路を選択できるようにした。既定値は従来のTypeSafe直接接続。
- この環境の `.env.local` に `TYPESAFE_API_BASE_URL=https://ai-gateway.vercel.sh/typesafe` を設定。既存のキー値は保持した。
- Vercel経由では `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`、Bearer認証、モデル `jev-latest` を使う。互換経路なので従来の `state`・Choice・Noul等の形式を維持する。
- API利用ログに実際の接続先を記録する。接続先を変えた場合は、以前の接続確認結果を再利用しない。
- 接続先は上記の2経路に限定する。回答の数値検証・信頼度の条件・注文設定は変更していない。

キーの環境変数名は互換性のため `TYPESAFE_API_KEY` のまま。Vercel経由発行のキーを保存しているこの環境では、ベースURLもVercel経由に合わせる必要がある。Vercelへデプロイする場合も、対象環境に同じベースURLを設定する。

試験用DBでJev＋OpenAIを使用している。通常サイトのDBのプロバイダー設定は変更していない。

## 同じ48問の3回比較

3つの担当エージェントが、同じ質問・期待条件を新規12会話で再試験した。前回と中間の記録は上書きしていない。

| 指標                       |  最初の48問 | 専用キー後・直接API | Vercel経由修正後 |
| -------------------------- | ----------: | ------------------: | ---------------: |
| 良好 / 一部不足 / 改善必要 | 18 / 9 / 21 |         19 / 9 / 20 |      19 / 9 / 20 |
| Jev HTTP成功 / 呼び出し    |      0 / 16 |              0 / 16 |          16 / 16 |
| Jev分類採用 / 検証拒否     |       0 / 0 |               0 / 0 |            9 / 7 |
| OpenAI HTTP成功 / 呼び出し |     24 / 24 |             24 / 24 |          24 / 24 |
| OpenAI回答採用 / 検証拒否  |      15 / 9 |              15 / 9 |          14 / 10 |
| OpenAI入出力トークン       |      25,885 |              25,264 |           25,927 |
| Jev入出力トークン          |      未取得 |              未取得 |           36,351 |
| 本文初表示中央値           |     0.230秒 |             0.241秒 |          0.652秒 |
| 回答完了中央値             |     0.924秒 |             0.728秒 |          1.005秒 |
| 回答完了最大               |     3.171秒 |             5.457秒 |          5.498秒 |

この表は各48問に対応するAPI呼び出しだけ。今回も計40呼び出し、APIなし21問。接続確認、追加ブラウザ操作、途中で中断した開発ブラウザ検証の呼び出しは別枠。

今回の48問ではOpenAI入力22,958・出力2,969、Jev入力27,462・出力8,889、両方合計62,278トークン。全40呼び出しの使用量を取得できた。Jevのキャッシュ済み入力等、返ってこない内訳は未取得のまま。請求額は算出していない。

HTTP200と分類採用は別。Jevの7結果は `invalid_classification` で拒否され、ローカル分類へ戻った。コードは既知の意図と0.7〜1の信頼度を要求する。生のAPI回答を保存していないため、7件の個別原因が信頼度か形式かは断定しない。

OpenAIの10拒否は、顧客数値の復唱に関わる `unsupported_number` 9回、業務事実に関わる `business_fact_owned_locally` 1回。不採用でも入力10,296・出力1,320、合計11,616トークンを使用した。

速度は定型文の即答も含む48問全体の実測で、モデルの処理時間だけではない。今回のJev通信中央値0.575秒、OpenAI通信中央値1.788秒。段落内容が実際に増えた質問は7問。通信復旧によって全質問の速度・品質が改善したという結果ではない。

## 変わった回答と残る問題

最初の48問との比較では、評価改善3問・低下2問・同評価43問。回答全文が変わったのは21問。評価はエージェントによるレビューであり、人間のお客様による評価や個別工学仕様の外部検証ではない。

「やっぱり4個へ変更」という台車関連部品の追加質問は、以前は型番を再質問していた。今回はJev分類を採用し、既出の確認用デモ商品の数量を4個へ変更、参考商品代33,600円（税抜・送料別）を回答できた。

スタッドの現物測定では、JevとOpenAIの両方を採用して測定箇所と屋内設備固定の条件を案内した。ただしM8・80ミリなどの条件要約は欠ける。中間のOpenAIだけの試験でも測定案内が改善していたため、この変化をJevだけの効果とはしない。

技術相談では、使用条件不明の金網に材質を広く推薦する、数値検証で比較説明が消える等の低下もあった。数量変更の一部、担当者へ渡す要約、質問付きのお礼、具体的な問い合わせ窓口の回答は改善が必要。今回の非公開社名・HPの出力検知は0件で、登録文字列照合と回答レビューの範囲の結果。

## 保存した資料

- [最初の48問とVercel経由後を並べた比較画面](../.data/verification/live-ai-2026-10-07/vercel-gateway-comparison.html)：担当・改善/低下・検索語で絞り込める。
- [回答全文Markdown](../.data/verification/live-ai-2026-10-07/vercel-gateway-comparison.md) / [Excel用CSV](../.data/verification/live-ai-2026-10-07/vercel-gateway-comparison.csv) / [集計・質問別API詳細JSON](../.data/verification/live-ai-2026-10-07/vercel-gateway-comparison.json)。
- [技術相談レビュー](../.data/verification/live-ai-2026-10-07/technical-vercel-gateway-review.md)、[会話の継続レビュー](../.data/verification/live-ai-2026-10-07/conversation-vercel-gateway-review.md)、[非公開・手続きレビュー](../.data/verification/live-ai-2026-10-07/privacy-orders-vercel-gateway-review.md)。各レビューに中間の401試験との比較も記載。
- [最小Gateway接続診断](../.data/verification/live-ai-2026-10-07/diagnostic-vercel-gateway.json) / [修正後の両API接続確認](../.data/verification/live-ai-2026-10-07/connection-checks-vercel-gateway.json)。Jev・OpenAIとも `ok:true`。
- [累積APIログ](../.data/verification/live-ai-2026-10-07/api-usage-all.json) / [CSV](../.data/verification/live-ai-2026-10-07/api-usage-all.csv)。以前の失敗も保持し、用途・実際のPOST先・モデル・送信サイズ・採否・時間・使用量・質問IDを記録する。
- [本番ビルドの公開チャットPC/スマホ操作](../.data/verification/live-ai-2026-10-07/chat-vercel-gateway-browser-results.json)。パッキン選定→水の配管という4問を送信し、全回答でOpenAI採用、前の相談を受けた次の確認質問を表示した。JavaScript例外・横はみ出し0。
- [比較画面のPC/スマホ検証](../.data/verification/live-ai-2026-10-07/vercel-gateway-comparison-browser-results.json)。48問、担当16問、改善3問、低下2問、検索・解除を確認。外部通信・JavaScript例外・横はみ出し0。

累積137件の内訳は、3回の各48問に対応する120呼び出し、接続確認8呼び出し、その他の公開ブラウザ操作・開発ブラウザの中断時の9呼び出し。開発サーバーの再読み込みでブラウザ検証が中断した呼び出しも削除せず、取得できなかった使用量を未取得として残した。本番ビルドで公開チャット操作を完了した。

管理画面の最終操作結果は [管理画面の再検証](../.data/verification/live-ai-2026-10-07/admin-usage-vercel-gateway-browser-results.json)。試験DBを使う本番ビルドの確認用サーバーは `http://localhost:3213/admin?tab=ai-usage`。

## コードの検証

Vercel経由の送信先・Bearer認証・実際の送信先のログ・接続先変更時の確認結果の無効化をテストした。型チェック、全95テスト、本番ビルドが成功した。従来のTypeSafe直接接続もテスト対象に残している。

比較の再作成は `node scripts/compare-live-ai.mjs vercel-gateway`。既存の結果だけを読み、APIを呼ばない。前回の回答・レビュー・集計のSHA256と、以前のAPIログ42件が変更されていないことも検証する。最初・中間の比較資料は別ファイルで保持する。
