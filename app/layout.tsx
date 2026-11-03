import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Steam Lens｜評論語言與區域售價',description:'一眼看懂 Steam 各語言評論、好評率與代表商店價格。公開查詢，免登入、免 API Key。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-Hant"><body>{children}</body></html>}
