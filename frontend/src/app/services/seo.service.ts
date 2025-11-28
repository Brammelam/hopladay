import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SEOService {
  private defaultTitle = 'Hopladay - Smart Holiday Planner & Vacation App | Maximize Your Days Off';
  private defaultDescription = 'Hopladay is the ultimate holiday planner and vacation app. Plan your holidays, maximize vacation days, and optimize your time off with AI-powered scheduling.';
  private defaultImage = 'https://hopladay.com/assets/og-image.png';
  private baseUrl = 'https://hopladay.com';

  constructor(
    private title: Title,
    private meta: Meta
  ) {}

  updateSEO(data: SEOData): void {
    const title = data.title 
      ? `${data.title} | Hopladay - Holiday Planner & Vacation App`
      : this.defaultTitle;
    
    const description = data.description || this.defaultDescription;
    const image = data.image || this.defaultImage;
    const url = data.url || this.baseUrl;
    const type = data.type || 'website';
    const keywords = data.keywords || 'holiday planner, vacation app, vacation planner, holiday planning app, maximize vacation days, optimize holidays';

    this.title.setTitle(title);

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'keywords', content: keywords });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
    this.meta.updateTag({ rel: 'canonical', href: url });

    const link = document.querySelector('link[rel="canonical"]');
    if (link) {
      link.setAttribute('href', url);
    } else {
      const canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      canonicalLink.setAttribute('href', url);
      document.head.appendChild(canonicalLink);
    }
  }

  setDefaultSEO(): void {
    this.updateSEO({});
  }
}

