/**
 * Hacker News 技术资讯抓取
 * TECH-001
 */

import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface TechNews {
  date: string;
  sources: {
    name: string;
    items: { title: string; url: string; score: number }[];
  }[];
}

// 关键词过滤
const KEYWORDS = ['AI', 'LLM', 'GPT', 'Claude', 'Cursor', 'Copilot', 'programming', 'agent', 'code', 'dev', 'software'];

// 缓存目录
const CACHE_DIR = path.join(process.cwd(), 'data/tech-news');

// 获取 Hacker News Top Stories
export async function fetchHackerNews(): Promise<{ title: string; url: string; score: number }[]> {
  try {
    logger.info('[TechNews] 正在抓取 Hacker News...');
    
    // 获取 Top Stories IDs
    const idsResponse = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const ids = await idsResponse.json() as number[];
    
    // 获取前30个故事的详情
    const topIds = ids.slice(0, 30);
    const promises = topIds.map(id => 
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        .then(r => r.json())
        .catch(() => null)
    );
    
    const stories = await Promise.all(promises);
    
    // 过滤包含关键词的故事
    const filtered = (stories as any[])
      .filter(s => s && s.title && KEYWORDS.some(k => s.title.toLowerCase().includes(k.toLowerCase())))
      .slice(0, 10)
      .map(s => ({
        title: s.title,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        score: s.score || 0
      }));
    
    logger.info(`[TechNews] 获取到 ${filtered.length} 条 Hacker News`);
    return filtered;
  } catch (error) {
    logger.error('[TechNews] 抓取 Hacker News 失败:', error);
    return [];
  }
}

// 抓取 GitHub Trending
export async function fetchGitHubTrending(): Promise<{ title: string; url: string; stars: number }[]> {
  try {
    logger.info('[TechNews] 正在抓取 GitHub Trending...');
    
    const response = await fetch('https://api.github.com/search/repositories?q=ai+OR+copilot+OR+agent+OR+llm+created:>2025-01-01&sort=stars&order=desc', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MarketPlayer/1.0'
      }
    });
    
    const data = await response.json() as any;
    const repos = (data.items || []).slice(0, 10).map((r: any) => ({
      title: r.full_name,
      url: r.html_url,
      stars: r.stargazers_count
    }));
    
    logger.info(`[TechNews] 获取到 ${repos.length} 个 GitHub 项目`);
    return repos;
  } catch (error) {
    logger.error('[TechNews] 抓取 GitHub Trending 失败:', error);
    return [];
  }
}

// 抓取 36kr AI 新闻
export async function fetch36krNews(): Promise<{ title: string; url: string; score: number }[]> {
  try {
    logger.info('[TechNews] 正在抓取 36kr AI...');
    
    const response = await fetch('https://www.36kr.com/information/AI/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    
    // 简单解析
    const titleMatch = html.match(/"article_title":"([^"]+)"/g);
    const urlMatch = html.match(/"article_url":"([^"]+)"/g);
    
    const items: { title: string; url: string; score: number }[] = [];
    if (titleMatch && urlMatch) {
      for (let i = 0; i < Math.min(5, titleMatch.length); i++) {
        const title = titleMatch[i].replace('"article_title":"', '').replace('"', '');
        let url = urlMatch[i].replace('"article_url":"', '').replace('"', '');
        if (!url.startsWith('http')) {
          url = 'https://www.36kr.com' + url;
        }
        items.push({ title, url, score: 0 });
      }
    }
    
    logger.info(`[TechNews] 获取到 ${items.length} 条 36kr 新闻`);
    return items;
  } catch (error) {
    logger.error('[TechNews] 抓取 36kr 失败:', error);
    return [];
  }
}

// 汇总所有技术资讯
export async function fetchAllTechNews(): Promise<TechNews> {
  const [hn, github, kr36] = await Promise.all([
    fetchHackerNews(),
    fetchGitHubTrending(),
    fetch36krNews()
  ]);
  
  const news: TechNews = {
    date: new Date().toISOString().split('T')[0],
    sources: [
      { name: 'HackerNews', items: hn },
      { name: 'GitHub', items: github.map(g => ({ ...g, score: g.stars })) },
      { name: '36kr', items: kr36 }
    ]
  };
  
  // 保存到缓存
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(CACHE_DIR, 'latest.json'),
      JSON.stringify(news, null, 2)
    );
    logger.info('[TechNews] 技术资讯已缓存');
  } catch (e) {
    logger.error('[TechNews] 缓存失败:', e);
  }
  
  return news;
}

// 生成技术简报
export function generateTechBrief(news: TechNews): string {
  let brief = `# 📰 技术简报 - ${news.date}\n\n`;
  
  // HackerNews
  if (news.sources[0].items.length > 0) {
    brief += `## 🔥 HackerNews Top\n`;
    news.sources[0].items.slice(0, 5).forEach((item, i) => {
      brief += `${i + 1}. [${item.title}](${item.url}) (${item.score} points)\n`;
    });
    brief += '\n';
  }
  
  // GitHub
  if (news.sources[1].items.length > 0) {
    brief += `## ⭐ GitHub Trending\n`;
    news.sources[1].items.slice(0, 5).forEach((item, i) => {
      brief += `${i + 1}. [${item.title}](${item.url}) ⭐ ${item.score}\n`;
    });
    brief += '\n';
  }
  
  // 36kr
  if (news.sources[2].items.length > 0) {
    brief += `## 📱 36kr AI\n`;
    news.sources[2].items.slice(0, 3).forEach((item, i) => {
      brief += `${i + 1}. [${item.title}](${item.url})\n`;
    });
  }
  
  return brief;
}

// 手动运行
export async function runTechNewsFetcher(): Promise<void> {
  logger.info('[TechNewsFetcher] 开始抓取技术资讯...');
  const news = await fetchAllTechNews();
  const brief = generateTechBrief(news);
  console.log(brief);
  logger.info('[TechNewsFetcher] 完成');
}
