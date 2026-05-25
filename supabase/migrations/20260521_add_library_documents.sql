-- Library-level playbook / blueprint documents (agency-scoped, not client-scoped)
create table if not exists library_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_url text not null default '',
  doc_category text not null default 'other',
  text_content text,
  is_text_doc boolean not null default false,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null
);

create index if not exists library_documents_user_id_idx on library_documents(user_id);

alter table library_documents enable row level security;

create policy "Users can manage their own library documents"
  on library_documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
