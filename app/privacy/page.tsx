import SiteShell from '@/components/SiteShell';
export default function Privacy() {
  return (
    <SiteShell>
      <div className="page-hero">
        <div className="container">
          <p className="eyebrow">PRIVACY</p>
          <h1>プライバシーに関するご案内</h1>
        </div>
      </div>
      <section className="section">
        <div className="container narrow prose">
          <p>
            このサイトは、ご相談への対応とサービスの確認のため、お問い合わせ・見積依頼で入力されたお名前、会社名、メールアドレス、相談内容、チャットでの会話を保存します。
          </p>
          <h2>利用目的</h2>
          <p>
            お問い合わせへの回答、製品の確認、見積作成、注文依頼への対応、サービス改善のために利用します。
          </p>
          <h2>情報の管理</h2>
          <p>
            管理画面は認証された担当者のみが利用します。注文依頼は担当者による確認を経て処理されます。
          </p>
          <h2>ご連絡先</h2>
          <p>保存内容の確認や訂正については、お問い合わせフォームからご連絡ください。</p>
          <div className="notice-box">
            このサイトは試験運用中です。正式なプライバシーポリシーは運用開始前に確認・公開する必要があります。
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
