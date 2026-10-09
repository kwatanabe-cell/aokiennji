'use client';
import { ArrowUpRight, Search } from 'lucide-react';
import { useState } from 'react';
import { openChat } from './ChatWidget';
export default function HeroConsult() {
  const [value, setValue] = useState('');
  const examples = [
    '耐熱ガラスを探している',
    '工業炉の部品を相談したい',
    '図面から製作できますか？',
  ];
  return (
    <div className="hero-consult">
      <p className="eyebrow light">PRODUCT CONSULTATION</p>
      <h2>
        お探しの製品を、
        <br />
        一緒に見つけます。
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) openChat(value.trim());
        }}
      >
        <label className="sr-only" htmlFor="hero-question">
          商品相談の内容
        </label>
        <Search size={21} />
        <input
          id="hero-question"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="商品名・型番・用途をご入力ください"
        />
        <button type="submit" disabled={!value.trim()} aria-label="相談を始める">
          <ArrowUpRight size={22} />
        </button>
      </form>
      <div className="hero-examples">
        <span>たとえば</span>
        {examples.map((x) => (
          <button key={x} type="button" onClick={() => openChat(x)}>
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}
