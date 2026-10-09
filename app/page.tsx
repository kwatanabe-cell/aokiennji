import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Phone } from 'lucide-react';
import SiteShell from '@/components/SiteShell';
import HeroConsult from '@/components/HeroConsult';
import { company, projects, services } from '@/lib/company';
export default function Home() {
  return (
    <SiteShell>
      <section className="hero">
        <div className="hero-image" role="img" aria-label="アオキエンジの製作実績" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <p className="eyebrow light">ENGINEERING FOR WHAT&apos;S NEXT</p>
            <h1>
              ものづくりの、
              <br />
              <em>その先まで。</em>
            </h1>
            <p>
              構想を、かたちに。現場の課題を、解決へ。
              <br />
              設計から製作、据付まで一貫して支えます。
            </p>
            <Link className="text-link light" href="/profile">
              私たちについて <ArrowUpRight size={18} />
            </Link>
          </div>
          <HeroConsult />
        </div>
        <div className="hero-bottom">
          <span>SCROLL TO EXPLORE</span>
          <span>01 / 04</span>
        </div>
      </section>
      <section className="section intro-section">
        <div className="container intro-grid">
          <div>
            <p className="eyebrow">OUR STRENGTH</p>
            <h2 className="section-title">
              現場を知る。
              <br />
              だから、つくれる。
            </h2>
          </div>
          <div>
            <p className="lead">
              鋼構造物や機械装置、工業炉まわりの部材まで。必要な仕様を丁寧に読み解き、製作と施工をつなぐ技術でお応えします。
            </p>
            <div className="intro-points">
              <span>
                <Check size={19} /> 設計から据付まで
              </span>
              <span>
                <Check size={19} /> 多様な設備に対応
              </span>
              <span>
                <Check size={19} /> 北九州から全国へ
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="section section-muted">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">WHAT WE DO</p>
              <h2 className="section-title">事業領域</h2>
            </div>
            <Link className="text-link" href="/products">
              製品・サービスを見る <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="service-grid">
            {services.map((s, i) => (
              <Link href="/products" className="service-card" key={s.id}>
                <div className="service-image">
                  <img src={s.image} alt={s.name} />
                </div>
                <div className="service-body">
                  <span className="service-number">
                    0{i + 1} / {s.english}
                  </span>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <ArrowUpRight size={20} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SELECTED WORKS</p>
              <h2 className="section-title">製作実績</h2>
            </div>
            <Link className="text-link" href="/projects">
              実績一覧を見る <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="project-feature-grid">
            {projects.slice(0, 3).map((p) => (
              <Link href="/projects" className="project-feature" key={p.id}>
                <div className="project-image">
                  <img src={p.image} alt={p.name} />
                </div>
                <span>{p.category}</span>
                <h3>
                  {p.name}
                  <ArrowUpRight size={19} />
                </h3>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section process-section">
        <div className="container">
          <p className="eyebrow light">HOW WE WORK</p>
          <h2 className="section-title light">ご相談から、納品まで。</h2>
          <div className="process-grid">
            {[
              {
                n: '01',
                h: 'ご相談',
                p: '製品名、型番、図面や用途など、わかる範囲でお聞かせください。',
              },
              {
                n: '02',
                h: '確認・ご提案',
                p: '仕様と条件を確認し、担当者が対応方法やお見積りをご案内します。',
              },
              { n: '03', h: '製作・調達', p: '必要な製品を製作・調達し、工程に沿って進めます。' },
              { n: '04', h: '納品・据付', p: '輸送から現地据付まで、案件に応じて対応します。' },
            ].map((s) => (
              <div key={s.n}>
                <span>{s.n}</span>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section contact-band">
        <div className="container contact-band-inner">
          <div>
            <p className="eyebrow">CONTACT</p>
            <h2>まずは、お聞かせください。</h2>
            <p>製品のお探しものから、製作・施工のご相談まで。</p>
          </div>
          <div>
            <Link className="button primary" href="/contact">
              お問い合わせ <ArrowUpRight size={19} />
            </Link>
            <a className="phone-link" href={`tel:${company.phone}`}>
              <Phone size={20} />
              {company.phone}
            </a>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
