import { useEffect } from "react";
import { CONTACT_EMAIL } from "@/lib/contact";
import { useLanguage, type Language } from "@/lib/language";
import { RENTAL_BRAND } from "@/lib/rental-brand";

type TermsContent = {
  title: string;
  updated: string;
  introduction: string;
  sections: { heading: string; paragraphs: string[] }[];
};

const terms: Record<Language, TermsContent> = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: October 15, 2026",
    introduction: "These terms apply to use of the PrimoStay Car Rental website and submission of a rental booking request.",
    sections: [
      { heading: "Booking requests", paragraphs: ["Submitting a booking request does not take an online payment or guarantee that a vehicle is available. We will review the request and contact you about its status and payment instructions."] },
      { heading: "Your information", paragraphs: ["Please provide accurate contact, driver and booking information. You are responsible for keeping your account and booking details up to date."] },
      { heading: "Questions", paragraphs: [`For questions about these terms or a booking request, contact ${CONTACT_EMAIL}.`] },
    ],
  },
  ja: {
    title: "利用規約",
    updated: "最終更新日：2026年10月15日",
    introduction: "本規約は、PrimoStay レンタカーウェブサイトの利用およびレンタカー予約リクエストの送信に適用されます。",
    sections: [
      { heading: "予約リクエスト", paragraphs: ["予約リクエストの送信時にオンライン決済は行われず、車両の利用可能性を保証するものではありません。内容を確認後、予約状況およびお支払い方法についてご連絡します。"] },
      { heading: "お客様情報", paragraphs: ["正確な連絡先、運転者および予約情報をご提供ください。アカウントおよび予約情報を最新の状態に保つ責任はお客様にあります。"] },
      { heading: "お問い合わせ", paragraphs: [`本規約または予約リクエストに関するお問い合わせは、${CONTACT_EMAIL}までご連絡ください。`] },
    ],
  },
  "zh-TW": {
    title: "服務條款",
    updated: "最後更新：2026年10月15日",
    introduction: "本條款適用於使用 PrimoStay 租車網站以及提交租車預訂申請。",
    sections: [
      { heading: "預訂申請", paragraphs: ["提交預訂申請時不會進行線上付款，也不保證車輛可供使用。我們確認申請後，將聯絡您說明預訂狀態及付款方式。"] },
      { heading: "您的資料", paragraphs: ["請提供正確的聯絡方式、駕駛人與預訂資料。您有責任確保帳戶及預訂資料保持最新。"] },
      { heading: "聯絡我們", paragraphs: [`如對本條款或預訂申請有任何疑問，請聯絡 ${CONTACT_EMAIL}。`] },
    ],
  },
};

export function TermsPage() {
  const { language } = useLanguage();
  const content = terms[language];

  useEffect(() => {
    document.title = `${content.title} | ${RENTAL_BRAND[language].name}`;
  }, [content.title, language]);

  return (
    <section className="bg-background py-14 md:py-20">
      <div className="container max-w-4xl">
        <header className="border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{RENTAL_BRAND[language].name}</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold text-foreground md:text-5xl">{content.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{content.updated}</p>
          <p className="mt-6 max-w-3xl text-base leading-7 text-foreground/80">{content.introduction}</p>
        </header>
        <div className="space-y-10 py-10">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-serif text-2xl font-semibold text-foreground">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-4 text-sm leading-7 text-foreground/80">{paragraph}</p>)}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
