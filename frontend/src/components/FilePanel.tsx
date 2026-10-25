import { Check, ChevronRight, Download, FileText, Folder } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileEntry, Project } from '../../../shared/contracts';
import { fileBlob, request } from '../api';

const ResearchEditor = lazy(() => import('../components/ResearchEditor'));
const PdfViewer = lazy(() => import('../components/PdfViewer'));

export default function FilePanel({
  project,
  revision,
  onError,
  initialPath = '',
}: {
  project?: Project;
  revision: number;
  onError: (error: unknown) => void;
  initialPath?: string;
}) {
  const { t } = useTranslation();

  const [directory, setDirectory] = useState('.');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [file, setFile] = useState('');
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    setDirectory('.');
    setFile('');
    setContent('');
    setOriginal('');
    setPreview('');
    epoch.current++;
  }, [project?.id]);
  useEffect(() => {
    if (!project) return;
    const controller = new AbortController();
    void request<FileEntry[]>(
      `/projects/${project.id}/files?path=${encodeURIComponent(directory)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setEntries)
      .catch((e) => {
        if (!controller.signal.aborted) onError(e);
      });
    return () => controller.abort();
  }, [project, directory, revision, onError]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function openFile(entry: FileEntry) {
    if (content !== original && !window.confirm(t('discardChanges'))) return;
    if (entry.directory) {
      setDirectory(entry.path);
      return;
    }
    if (!project) return;
    const version = ++epoch.current;
    try {
      if (/\.(pdf|png|jpe?g|webp)$/i.test(entry.path)) {
        const blob = await fileBlob(project.id, entry.path);
        if (version !== epoch.current) return;
        setPreview(URL.createObjectURL(blob));
        setContent('');
        setOriginal('');
      } else {
        const result = await request<{ content: string }>(
          `/projects/${project.id}/file?path=${encodeURIComponent(entry.path)}`,
        );
        if (version !== epoch.current) return;
        setContent(result.content);
        setOriginal(result.content);
        setPreview('');
      }
      setFile(entry.path);
    } catch (e) {
      onError(e);
    }
  }
  useEffect(() => {
    if (initialPath && project)
      void openFile({ path: initialPath, name: initialPath, directory: false, size: 0 });
  }, [initialPath, project?.id]);
  return (
    <section className="file-panel">
      <div className="panel-heading">
        <h2>{t('projectFiles')}</h2>
        <span>{t('local')}</span>
      </div>
      {!project ? (
        <p className="muted padded">{t('fileEmpty')}</p>
      ) : (
        <>
          <div className="file-breadcrumb">
            <button onClick={() => setDirectory('.')}>{project.name}</button>
            {directory !== '.' && (
              <>
                <ChevronRight size={13} />
                <span>{directory}</span>
                <button
                  onClick={() =>
                    setDirectory(
                      directory.replace(/[\\/][^\\/]+$/, '') === directory
                        ? '.'
                        : directory.replace(/[\\/][^\\/]+$/, ''),
                    )
                  }
                >
                  {t('parentFolder')}
                </button>
              </>
            )}
          </div>
          <div className="file-list">
            {entries.map((e) => (
              <button
                title={e.path}
                key={e.path}
                className={file === e.path ? 'active' : ''}
                onClick={() => void openFile(e)}
              >
                {e.directory ? <Folder size={14} /> : <FileText size={14} />}
                <span>{e.name}</span>
                {!e.directory && (
                  <small>{e.size < 1024 ? `${e.size} B` : `${Math.round(e.size / 1024)} KB`}</small>
                )}
              </button>
            ))}
          </div>
          {file && (
            <div className="file-editor">
              <div className="editor-toolbar">
                <span title={file}>
                  {file.split(/[\\/]/).at(-1)}
                  {content !== original && t('unsaved')}
                </span>
                {!preview ? (
                  <button
                    aria-label={t('saveFile')}
                    disabled={saving || content === original}
                    onClick={() => {
                      setSaving(true);
                      void request(`/projects/${project.id}/file`, 'PUT', {
                        path: file,
                        content,
                        original,
                      })
                        .then(() => setOriginal(content))
                        .catch(onError)
                        .finally(() => setSaving(false));
                    }}
                  >
                    <Check size={14} />
                    {t('save')}
                  </button>
                ) : (
                  <a
                    href={preview}
                    download={file.split(/[\\/]/).at(-1)}
                    aria-label={t('download')}
                  >
                    <Download size={15} />
                  </a>
                )}
              </div>
              {preview ? (
                /\.pdf$/i.test(file) ? (
                  <Suspense fallback={<p className="padded muted">{t('loadingPdf')}</p>}>
                    <PdfViewer url={preview} />
                  </Suspense>
                ) : (
                  <img alt={file} src={preview} />
                )
              ) : (
                <Suspense fallback={<p className="padded muted">{t('loadingEditor')}</p>}>
                  <ResearchEditor
                    path={`${project.id}/${file}`}
                    value={content}
                    onChange={setContent}
                  />
                </Suspense>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
