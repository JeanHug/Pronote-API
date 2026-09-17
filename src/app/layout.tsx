import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
export const metadata:Metadata={title:'Pronote API — Console v5',description:'API ENT77 reconstruite : session vérifiée, résultats chiffrés, tests de bout en bout et documentation.'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="fr"><body>{children}</body></html>;}
