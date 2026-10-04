import { useEffect } from "react";
import { CONTACT_EMAIL } from "@/lib/contact";
import { useLanguage, type Language } from "@/lib/language";

type Section = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
};

type PolicyContent = {
  title: string;
  updated: string;
  introduction: string;
  sections: Section[];
};

const policy: Record<Language, PolicyContent> = {
  en: {
    title: "Privacy Policy",
    updated: "Last updated: October 4, 2026",
    introduction: "CIAO Rental Car respects your privacy. This policy explains how we handle personal information when you use our website, create an account, or make and manage a rental-car reservation.",
    sections: [
      { heading: "Information we collect", items: ["Account information, including your name, email address, telephone number, preferred language, and sign-in details.", "Reservation information, including rental dates and times, pickup and return locations, selected vehicle and add-ons, driver details, and booking status.", "Documents you choose to provide for licence and identity verification.", "Payment status and transaction references supplied by our payment provider. We do not store complete payment-card details.", "Technical information needed to operate and protect the service, such as browser information, IP address, and security logs."] },
      { heading: "How we use information", items: ["Create and manage customer accounts and reservations.", "Verify rental eligibility and prepare vehicle pickup and return.", "Process payments and communicate confirmations, updates, receipts, and service notices.", "Provide customer support, prevent misuse, maintain security, and comply with legal obligations.", "Improve the reliability and usability of our rental service."] },
      { heading: "Google sign-in", paragraphs: ["If you choose Google sign-in, Google provides us with basic account information such as your name, email address, and profile identifier. We use it only to create or access your CIAO Rental Car account. Your use of Google services is also governed by Google's own privacy policy."] },
      { heading: "Service providers and disclosure", paragraphs: ["We share information only as needed with providers that help us host the service, authenticate users, send email, process payments, and operate reservations. We may also disclose information when required by law, to protect customers or the service, or as part of a business transfer. We do not sell personal information."] },
      { heading: "Retention and security", paragraphs: ["We keep personal information only for as long as reasonably necessary to provide the service, meet accounting and legal requirements, resolve disputes, and protect the service. We use reasonable administrative and technical safeguards, but no online service can guarantee absolute security."] },
      { heading: "Your choices and rights", paragraphs: ["You may ask to access, correct, or delete your personal information, subject to applicable legal and operational requirements. You may also stop using Google sign-in or request help with your account by contacting us."] },
      { heading: "Children", paragraphs: ["This service is intended for people legally able to enter a vehicle-rental agreement. We do not knowingly collect personal information from children for account registration or booking."] },
      { heading: "Changes to this policy", paragraphs: ["We may update this policy when our service or legal obligations change. The revised date at the top of this page shows when the latest version took effect."] },
      { heading: "Contact", paragraphs: [`For privacy questions or requests, contact us at ${CONTACT_EMAIL}.`] },
    ],
  },
  ja: {
    title: "プライバシーポリシー",
    updated: "最終更新日：2026年10月4日",
    introduction: "CIAO Rental Carは、お客様のプライバシーを尊重します。本ポリシーでは、当ウェブサイトの利用、アカウント作成、レンタカー予約および予約管理の際に、個人情報をどのように取り扱うかを説明します。",
    sections: [
      { heading: "取得する情報", items: ["氏名、メールアドレス、電話番号、希望言語、ログイン情報などのアカウント情報。", "利用日時、貸出・返却場所、車両、オプション、運転者情報、予約状況などの予約情報。", "免許証および本人確認のためにお客様が提出する書類。", "決済事業者から提供される決済状況および取引参照情報。完全なカード情報は保存しません。", "ブラウザ情報、IPアドレス、セキュリティログなど、サービスの運営と保護に必要な技術情報。"] },
      { heading: "利用目的", items: ["顧客アカウントおよび予約の作成・管理。", "貸渡資格の確認、車両の貸出および返却準備。", "決済処理、予約確認、変更案内、領収書、重要なお知らせの送信。", "顧客対応、不正利用の防止、安全性の維持、法令上の義務への対応。", "レンタカーサービスの信頼性および利便性の改善。"] },
      { heading: "Googleログイン", paragraphs: ["Googleログインを選択した場合、Googleから氏名、メールアドレス、プロフィール識別子などの基本的なアカウント情報が提供されます。これらはCIAO Rental Carアカウントの作成またはログインのためにのみ利用します。Googleサービスの利用にはGoogleのプライバシーポリシーも適用されます。"] },
      { heading: "委託先および第三者提供", paragraphs: ["サービスのホスティング、認証、メール送信、決済処理、予約運営に必要な範囲で、業務委託先に情報を共有します。また、法令に基づく場合、お客様またはサービスの保護に必要な場合、事業承継の場合に情報を開示することがあります。個人情報を販売することはありません。"] },
      { heading: "保存期間と安全管理", paragraphs: ["サービス提供、会計・法令上の義務、紛争解決、サービス保護に合理的に必要な期間のみ個人情報を保存します。合理的な管理上・技術上の安全対策を講じますが、オンラインサービスの完全な安全性を保証することはできません。"] },
      { heading: "お客様の権利", paragraphs: ["適用法令および業務上必要な範囲に従い、個人情報の開示、訂正、削除を請求できます。Googleログインの利用停止やアカウントに関するサポートもお問い合わせいただけます。"] },
      { heading: "未成年者", paragraphs: ["本サービスは、車両貸渡契約を適法に締結できる方を対象としています。アカウント登録または予約のために、子どもの個人情報を故意に取得することはありません。"] },
      { heading: "本ポリシーの変更", paragraphs: ["サービス内容または法令上の義務の変更に応じて、本ポリシーを更新することがあります。ページ上部の更新日が最新の適用日です。"] },
      { heading: "お問い合わせ", paragraphs: [`プライバシーに関するご質問・ご請求は、${CONTACT_EMAIL}までご連絡ください。`] },
    ],
  },
  "zh-TW": {
    title: "隱私權政策",
    updated: "最後更新：2026年10月4日",
    introduction: "CIAO Rental Car 尊重您的隱私。本政策說明您使用本網站、建立帳戶，以及預訂或管理租車服務時，我們如何處理個人資料。",
    sections: [
      { heading: "我們蒐集的資料", items: ["姓名、電子郵件、電話號碼、偏好語言與登入資料等帳戶資訊。", "租車日期與時間、取還車地點、所選車輛與加購項目、駕駛人資料及預訂狀態。", "您為駕照及身分驗證而選擇提交的文件。", "付款服務供應商提供的付款狀態與交易參考資料；我們不儲存完整的付款卡資料。", "維持與保護服務所需的技術資訊，例如瀏覽器資訊、IP 位址與安全性記錄。"] },
      { heading: "資料使用方式", items: ["建立及管理顧客帳戶與預訂。", "確認租車資格並準備取車與還車作業。", "處理付款，並傳送確認信、更新通知、收據與服務訊息。", "提供顧客服務、防止濫用、維護安全及遵守法律義務。", "改善租車服務的可靠性與易用性。"] },
      { heading: "Google 登入", paragraphs: ["若您選擇使用 Google 登入，Google 會向我們提供姓名、電子郵件與個人檔案識別碼等基本帳戶資訊。我們只會將其用於建立或登入 CIAO Rental Car 帳戶。您使用 Google 服務時，也適用 Google 自身的隱私權政策。"] },
      { heading: "服務供應商與資料揭露", paragraphs: ["我們只會在託管服務、身分驗證、寄送電子郵件、處理付款及營運預訂所需的範圍內，與協助我們的服務供應商分享資料。依法要求、保護顧客或服務，以及企業移轉時，我們也可能揭露資料。我們不會出售個人資料。"] },
      { heading: "保存與安全", paragraphs: ["我們僅在提供服務、履行會計與法律要求、處理爭議及保護服務所合理需要的期間內保存個人資料。我們採取合理的管理與技術安全措施，但任何線上服務都無法保證絕對安全。"] },
      { heading: "您的選擇與權利", paragraphs: ["在適用法律與營運需求允許的範圍內，您可以要求查閱、更正或刪除個人資料。您也可以停止使用 Google 登入，或聯絡我們取得帳戶協助。"] },
      { heading: "兒童", paragraphs: ["本服務適用於可依法簽訂車輛租賃契約的人士。我們不會故意蒐集兒童資料以供帳戶註冊或預訂使用。"] },
      { heading: "政策變更", paragraphs: ["我們可能因服務或法律義務變更而更新本政策。頁面頂端的日期代表最新版本的生效日期。"] },
      { heading: "聯絡我們", paragraphs: [`如有隱私相關問題或要求，請聯絡 ${CONTACT_EMAIL}。`] },
    ],
  },
};

export function PrivacyPolicyPage() {
  const { language } = useLanguage();
  const content = policy[language];

  useEffect(() => {
    document.title = `${content.title} | CIAO Rental Car`;
    const description = content.introduction;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [content]);

  return (
    <section className="bg-background py-14 md:py-20">
      <div className="container max-w-4xl">
        <header className="border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">CIAO Rental Car</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold text-foreground md:text-5xl">{content.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{content.updated}</p>
          <p className="mt-6 max-w-3xl text-base leading-7 text-foreground/80">{content.introduction}</p>
        </header>

        <div className="space-y-10 py-10">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-serif text-2xl font-semibold text-foreground">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-sm leading-7 text-foreground/80">{paragraph}</p>
              ))}
              {section.items && (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-foreground/80">
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
