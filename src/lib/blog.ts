import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');

export interface PostFrontmatter {
  title: string;
  description: string;
  date: string;
  ogImage: string;
  tags: string[];
}

export interface PostSummary extends PostFrontmatter {
  slug: string;
}

export interface Post extends PostSummary {
  content: string;
}

function readSlugs(): string[] {
  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => file.replace(/\.mdx$/, ''));
}

export function getAllPosts(): PostSummary[] {
  return readSlugs()
    .map((slug) => {
      const { data } = matter(fs.readFileSync(path.join(BLOG_DIR, `${slug}.mdx`), 'utf8'));
      return { slug, ...(data as PostFrontmatter) };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostBySlug(slug: string): Post | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
  return { slug, content, ...(data as PostFrontmatter) };
}
