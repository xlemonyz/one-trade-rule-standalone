do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pathok_documents'
  ) then
    alter publication supabase_realtime add table public.pathok_documents;
  end if;
end
$$;
