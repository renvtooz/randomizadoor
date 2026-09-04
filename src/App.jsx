import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutGrid, PlusCircle, Sparkles, Database, Shuffle, Trash2, Pencil,
  Check, X, Loader2, Copy, RefreshCw, AlertCircle, Download, ExternalLink,
  BookOpen, CheckCircle2, Tag, ChevronDown, ChevronRight, KeyRound,
} from "lucide-react";
import { storage } from "./lib/storage";

const DEFAULT_TOPICS = [
  "Carga eléctrica y Ley de Coulomb",
  "Campo eléctrico",
  "Ley de Gauss",
  "Potencial eléctrico",
  "Capacitores y dieléctricos",
  "Corriente y resistencia",
  "Circuitos de corriente continua",
  "Campo magnético",
  "Ley de Ampère",
  "Inducción electromagnética (Ley de Faraday)",
  "Circuitos RL, RC y RLC",
  "Ondas electromagnéticas",
];

const DIFFICULTIES = ["Básico", "Intermedio", "Avanzado"];

// La generación de preguntas con IA llama a la API de Anthropic con una clave propia
// (ver README). Queda desactivada por defecto para que el proyecto funcione "de una"
// sin pedirle una clave a nadie. Cambia esto a `true` cuando quieras activarla.
const AI_FEATURE_ENABLED = false;
const DIFF_COLOR = { Básico: "var(--green)", Intermedio: "var(--ochre)", Avanzado: "var(--red)" };
const TYPE_LABEL = { mc: "Opción múltiple", vf: "Verdadero / Falso" };

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function emptyManualQuestion(defaultTopic) {
  return {
    id: uid(),
    text: "",
    type: "mc",
    options: ["", "", "", ""],
    correctIndex: 0,
    topic: defaultTopic,
    difficulty: "Básico",
    explanation: "",
    source: "manual",
  };
}

function shuffleQuestionOptions(q) {
  if (q.type === "vf") return q;
  const idxs = q.options.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return {
    ...q,
    options: idxs.map((i) => q.options[i]),
    correctIndex: idxs.indexOf(q.correctIndex),
  };
}

/**
 * Builds one Apps Script that creates MANY Google Forms in a single run (one per
 * "variante"/prueba), each with its own set of questions, and finishes by creating
 * a summary Google Sheet listing every form's student link and edit link.
 */
function buildAppsScript({ title, description, isQuiz, variants }) {
  const varData = variants.map((v) => ({
    label: v.label,
    preguntas: v.questions.map((q) => ({
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation || "",
    })),
  }));
  const lines = [];
  lines.push("function crearFormulariosFisica2() {");
  lines.push("  var tituloBase = " + JSON.stringify(title) + ";");
  lines.push("  var descripcion = " + JSON.stringify(description) + ";");
  lines.push("  var esQuiz = " + (isQuiz ? "true" : "false") + ";");
  lines.push("  var pruebas = " + JSON.stringify(varData, null, 2) + ";");
  lines.push("");
  lines.push("  var resumen = [];");
  lines.push("");
  lines.push("  pruebas.forEach(function (prueba) {");
  lines.push("    var form = FormApp.create(tituloBase + ' - ' + prueba.label);");
  lines.push("    form.setDescription(descripcion);");
  lines.push("    form.setIsQuiz(esQuiz);");
  lines.push("");
  lines.push("    prueba.preguntas.forEach(function (p) {");
  lines.push("      var item = form.addMultipleChoiceItem();");
  lines.push("      item.setTitle(p.text).setRequired(true);");
  lines.push("      var choices = [];");
  lines.push("      for (var i = 0; i < p.options.length; i++) {");
  lines.push("        choices.push(item.createChoice(p.options[i], i === p.correctIndex));");
  lines.push("      }");
  lines.push("      item.setChoices(choices);");
  if (isQuiz) {
    lines.push("      item.setPoints(1);");
    lines.push("      if (p.explanation) {");
    lines.push("        var fb = FormApp.createFeedback().setText(p.explanation).build();");
    lines.push("        item.setFeedbackForCorrect(fb);");
    lines.push("      }");
  }
  lines.push("    });");
  lines.push("");
  lines.push("    resumen.push([prueba.label, form.getPublishedUrl(), form.getEditUrl()]);");
  lines.push('    Logger.log(prueba.label + ": " + form.getPublishedUrl());');
  lines.push("  });");
  lines.push("");
  lines.push("  var hoja = SpreadsheetApp.create(tituloBase + ' - enlaces');");
  lines.push("  var sheet = hoja.getActiveSheet();");
  lines.push('  sheet.appendRow(["Prueba", "Enlace para el estudiante", "Enlace de edición"]);');
  lines.push("  resumen.forEach(function (fila) { sheet.appendRow(fila); });");
  lines.push('  sheet.autoResizeColumns(1, 3);');
  lines.push("");
  lines.push('  Logger.log("Hoja con todos los enlaces: " + hoja.getUrl());');
  lines.push("}");
  return lines.join("\n");
}

async function generateWithAI({ apiKey, topic, concept, difficulty, type, count }) {
  const typeInstruction =
    type === "vf"
      ? 'Cada pregunta es de tipo Verdadero/Falso. El campo "options" debe ser exactamente ["Verdadero", "Falso"].'
      : 'Cada pregunta es de opción múltiple con exactamente 4 alternativas en "options", solo una correcta.';

  const prompt = `Eres un profesor experto en Física II (electromagnetismo) de nivel universitario, escribiendo preguntas de examen en español para estudiantes de ingeniería.

Genera ${count} preguntas nuevas y distintas entre sí sobre el tema "${topic}"${
    concept ? `, enfocadas específicamente en: ${concept}` : ""
  }, con dificultad "${difficulty}".
${typeInstruction}
Incluye preguntas conceptuales y, cuando aplique al tema, preguntas de cálculo con datos numéricos razonables. Evita ambigüedad y evita repetir la misma idea en más de una pregunta. Escribe una breve "explanation" (1-2 frases) que justifique la respuesta correcta.

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional, sin backticks y sin comentarios, con este formato exacto:
[{"text": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..."}]`;

  if (!apiKey || !apiKey.trim()) {
    throw new Error("Ingresa tu clave de API de Anthropic para poder generar preguntas.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      // Required so the Anthropic API accepts a request made directly from the browser.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("La clave de API no es válida. Revísala en tu cuenta de Anthropic.");
    }
    throw new Error("La API respondió con un error (" + response.status + ").");
  }

  const data = await response.json();
  const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text);
  const raw = textBlocks.join("\n").trim();
  const clean = raw.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error("No se pudo interpretar la respuesta de la IA. Intenta con menos preguntas.");
  }
  if (!Array.isArray(parsed)) throw new Error("Formato de respuesta inesperado.");
  return parsed;
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={"p2-toast " + (toast.kind === "error" ? "p2-toast-error" : "p2-toast-ok")}>
      {toast.kind === "error" ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
      <span>{toast.msg}</span>
    </div>
  );
}

function Dot({ color }) {
  return <span className="p2-dot" style={{ background: color }} />;
}

function StatBar({ label, value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="p2-statbar-row">
      <div className="p2-statbar-label">{label}</div>
      <div className="p2-statbar-track">
        <div className="p2-statbar-fill" style={{ width: pct + "%" }} />
      </div>
      <div className="p2-statbar-value">{value}</div>
    </div>
  );
}

/* Topic <select> that also lets the teacher type and add a brand-new topic inline. */
function TopicSelect({ topics, value, onChange, onAddTopic, small }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const options = topics.includes(value) || !value ? topics : [value, ...topics];

  const commit = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    onAddTopic(name);
    onChange(name);
    setDraft("");
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="p2-topic-add-row">
        <input
          autoFocus
          type="text"
          value={draft}
          placeholder="Nombre del nuevo tema"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setAdding(false); setDraft(""); }
          }}
        />
        <button type="button" className="p2-topic-add-btn" onClick={commit}>Agregar</button>
        <button type="button" className="p2-topic-cancel-btn" onClick={() => { setAdding(false); setDraft(""); }}>
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="p2-topic-select">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button type="button" className="p2-topic-new-link" onClick={() => setAdding(true)}>
        + nuevo tema
      </button>
    </div>
  );
}

function QuestionCard({ q, onEdit, onDelete }) {
  return (
    <div className="p2-qcard" style={{ "--stripe": DIFF_COLOR[q.difficulty] }}>
      <div className="p2-qcard-top">
        <div className="p2-qcard-meta">
          <span className="p2-meta-item"><Dot color={DIFF_COLOR[q.difficulty]} />{q.difficulty}</span>
          <span className="p2-meta-item p2-meta-plain">{TYPE_LABEL[q.type]}</span>
          {q.source === "ia" && (
            <span className="p2-meta-item"><Dot color="var(--blue)" />IA</span>
          )}
        </div>
        <div className="p2-qcard-actions">
          <button className="p2-iconbtn" onClick={() => onEdit(q)} title="Editar">
            <Pencil size={14} />
          </button>
          <button className="p2-iconbtn p2-iconbtn-danger" onClick={() => onDelete(q.id)} title="Eliminar">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="p2-qcard-topic">{q.topic}</div>
      <div className="p2-qcard-text">{q.text || <em>(sin enunciado)</em>}</div>
      <ul className="p2-qcard-options">
        {q.options.map((opt, i) => (
          <li key={i} className={i === q.correctIndex ? "p2-opt-correct" : ""}>
            {i === q.correctIndex && <Check size={12} />}
            <span>{opt || <em>(vacío)</em>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionEditModal({ question, topics, onAddTopic, onSave, onClose }) {
  const [q, setQ] = useState(question);
  useEffect(() => setQ(question), [question]);
  if (!q) return null;

  const setOption = (i, val) => {
    const opts = [...q.options];
    opts[i] = val;
    setQ({ ...q, options: opts });
  };
  const setType = (type) => {
    if (type === "vf") setQ({ ...q, type, options: ["Verdadero", "Falso"], correctIndex: 0 });
    else setQ({ ...q, type, options: q.options.length >= 4 ? q.options.slice(0, 4) : ["", "", "", ""], correctIndex: 0 });
  };

  return (
    <div className="p2-modal-overlay" onClick={onClose}>
      <div className="p2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="p2-modal-head">
          <h3>Editar pregunta</h3>
          <button className="p2-iconbtn" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="p2-form-grid">
          <label className="p2-field">
            <span>Tema</span>
            <TopicSelect topics={topics} value={q.topic} onChange={(v) => setQ({ ...q, topic: v })} onAddTopic={onAddTopic} />
          </label>
          <label className="p2-field">
            <span>Dificultad</span>
            <select value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="p2-field">
            <span>Tipo</span>
            <select value={q.type} onChange={(e) => setType(e.target.value)}>
              <option value="mc">Opción múltiple</option>
              <option value="vf">Verdadero / Falso</option>
            </select>
          </label>
        </div>

        <label className="p2-field p2-field-full">
          <span>Enunciado</span>
          <textarea rows={3} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} />
        </label>

        <div className="p2-field p2-field-full">
          <span>Alternativas (marca la correcta)</span>
          {q.options.map((opt, i) => (
            <div className="p2-option-row" key={i}>
              <input type="radio" name="correct" checked={q.correctIndex === i} onChange={() => setQ({ ...q, correctIndex: i })} />
              <input type="text" value={opt} disabled={q.type === "vf"} onChange={(e) => setOption(i, e.target.value)} placeholder={"Alternativa " + (i + 1)} />
            </div>
          ))}
        </div>

        <label className="p2-field p2-field-full">
          <span>Explicación (opcional, se usa como retroalimentación)</span>
          <textarea rows={2} value={q.explanation || ""} onChange={(e) => setQ({ ...q, explanation: e.target.value })} />
        </label>

        <div className="p2-modal-actions">
          <button className="p2-btn p2-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="p2-btn p2-btn-primary" onClick={() => onSave(q)} disabled={!q.text.trim() || q.options.some((o) => !o.trim())}>
            <Check size={14} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ bank, topics, customTopics, onAddTopic, onRemoveTopic, onGo }) {
  const total = bank.length;
  const byDifficulty = DIFFICULTIES.map((d) => ({ label: d, value: bank.filter((q) => q.difficulty === d).length }));
  const byTopic = topics.map((t) => ({ label: t, value: bank.filter((q) => q.topic === t).length })).filter((t) => t.value > 0);
  const aiCount = bank.filter((q) => q.source === "ia").length;
  const maxTopic = Math.max(1, ...byTopic.map((t) => t.value));
  const [newTopic, setNewTopic] = useState("");

  const addTopic = () => {
    const name = newTopic.trim();
    if (!name) return;
    onAddTopic(name);
    setNewTopic("");
  };

  return (
    <div className="p2-view">
      <h2 className="p2-view-title">Resumen del banco</h2>
      <p className="p2-view-sub">Vista general de tus preguntas de Física II antes de armar una evaluación.</p>

      <div className="p2-stat-cards">
        <div className="p2-stat-card">
          <div className="p2-stat-number">{total}</div>
          <div className="p2-stat-label">preguntas totales</div>
        </div>
        <div className="p2-stat-card">
          <div className="p2-stat-number">{aiCount}</div>
          <div className="p2-stat-label">generadas con IA</div>
        </div>
        <div className="p2-stat-card">
          <div className="p2-stat-number">{byTopic.length}</div>
          <div className="p2-stat-label">temas cubiertos</div>
        </div>
      </div>

      {total === 0 ? (
        <div className="p2-empty">
          <BookOpen size={26} />
          <p>Aún no hay preguntas en el banco.</p>
          <div className="p2-empty-actions">
            <button className="p2-btn p2-btn-primary" onClick={() => onGo("create")}><PlusCircle size={14} /> Crear una pregunta</button>
            <button className="p2-btn p2-btn-ghost" onClick={() => onGo("ai")}><Sparkles size={14} /> Generar con IA</button>
          </div>
        </div>
      ) : (
        <div className="p2-panels-row">
          <div className="p2-panel">
            <h4>Por dificultad</h4>
            {byDifficulty.map((d) => <StatBar key={d.label} label={d.label} value={d.value} max={total} />)}
          </div>
          <div className="p2-panel">
            <h4>Por tema</h4>
            <div className="p2-panel-scroll">
              {byTopic.map((t) => <StatBar key={t.label} label={t.label} value={t.value} max={maxTopic} />)}
            </div>
          </div>
        </div>
      )}

      <h3 className="p2-subhead">Temas</h3>
      <p className="p2-view-sub" style={{ marginBottom: 14 }}>
        Crea tus propios temas: aparecerán de inmediato al crear preguntas, generarlas con IA y al armar evaluaciones.
      </p>
      <div className="p2-panel">
        <div className="p2-topic-add-row" style={{ marginBottom: customTopics.length ? 14 : 0 }}>
          <input
            type="text"
            value={newTopic}
            placeholder="Ej: Ondas estacionarias en líneas de transmisión"
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTopic()}
          />
          <button type="button" className="p2-topic-add-btn" onClick={addTopic}>
            <PlusCircle size={14} /> Agregar tema
          </button>
        </div>
        {customTopics.length > 0 && (
          <div className="p2-topic-chips">
            {customTopics.map((t) => (
              <span key={t} className="p2-topic-chip">
                <Tag size={11} />
                {t}
                <button type="button" onClick={() => onRemoveTopic(t)} title="Eliminar tema">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateManualView({ topics, onAddTopic, onAdd, pushToast }) {
  const [q, setQ] = useState(() => emptyManualQuestion(topics[0]));

  const setOption = (i, val) => {
    const opts = [...q.options];
    opts[i] = val;
    setQ({ ...q, options: opts });
  };
  const setType = (type) => {
    if (type === "vf") setQ({ ...q, type, options: ["Verdadero", "Falso"], correctIndex: 0 });
    else setQ({ ...q, type, options: ["", "", "", ""], correctIndex: 0 });
  };

  const canSave = q.text.trim() && q.options.every((o) => o.trim());

  const save = () => {
    onAdd({ ...q, id: uid(), source: "manual" });
    pushToast("Pregunta agregada al banco.");
    setQ(emptyManualQuestion(topics[0]));
  };

  return (
    <div className="p2-view">
      <h2 className="p2-view-title">Crear pregunta</h2>
      <p className="p2-view-sub">Escribe tu propia pregunta y agrégala al banco. Si el tema que necesitas no está en la lista, créalo al vuelo.</p>

      <div className="p2-form-card">
        <div className="p2-form-grid">
          <label className="p2-field">
            <span>Tema</span>
            <TopicSelect topics={topics} value={q.topic} onChange={(v) => setQ({ ...q, topic: v })} onAddTopic={onAddTopic} />
          </label>
          <label className="p2-field">
            <span>Dificultad</span>
            <select value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="p2-field">
            <span>Tipo</span>
            <select value={q.type} onChange={(e) => setType(e.target.value)}>
              <option value="mc">Opción múltiple</option>
              <option value="vf">Verdadero / Falso</option>
            </select>
          </label>
        </div>

        <label className="p2-field p2-field-full">
          <span>Enunciado</span>
          <textarea
            rows={3}
            value={q.text}
            onChange={(e) => setQ({ ...q, text: e.target.value })}
            placeholder="Ej: Dos cargas puntuales de +2 µC y -3 µC están separadas 0.5 m. ¿Cuál es la magnitud de la fuerza entre ellas?"
          />
        </label>

        <div className="p2-field p2-field-full">
          <span>Alternativas (marca la correcta)</span>
          {q.options.map((opt, i) => (
            <div className="p2-option-row" key={i}>
              <input type="radio" name="correct-manual" checked={q.correctIndex === i} onChange={() => setQ({ ...q, correctIndex: i })} />
              <input type="text" value={opt} disabled={q.type === "vf"} onChange={(e) => setOption(i, e.target.value)} placeholder={"Alternativa " + (i + 1)} />
            </div>
          ))}
        </div>

        <label className="p2-field p2-field-full">
          <span>Explicación (opcional)</span>
          <textarea rows={2} value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} />
        </label>

        <div className="p2-modal-actions">
          <button className="p2-btn p2-btn-ghost" onClick={() => setQ(emptyManualQuestion(topics[0]))}>Limpiar</button>
          <button className="p2-btn p2-btn-primary" disabled={!canSave} onClick={save}><PlusCircle size={14} /> Agregar al banco</button>
        </div>
      </div>
    </div>
  );
}

function AIResultCard({ item, onChange, onDiscard }) {
  const setOption = (i, val) => {
    const opts = [...item.options];
    opts[i] = val;
    onChange({ ...item, options: opts });
  };
  return (
    <div className={"p2-airesult" + (item.selected ? "" : " p2-airesult-off")}>
      <div className="p2-qcard-top">
        <label className="p2-checkline">
          <input type="checkbox" checked={item.selected} onChange={(e) => onChange({ ...item, selected: e.target.checked })} />
          <span>Incluir</span>
        </label>
        <button className="p2-iconbtn p2-iconbtn-danger" onClick={() => onDiscard(item.id)} title="Descartar">
          <Trash2 size={14} />
        </button>
      </div>
      <textarea className="p2-airesult-text" rows={2} value={item.text} onChange={(e) => onChange({ ...item, text: e.target.value })} />
      {item.options.map((opt, i) => (
        <div className="p2-option-row" key={i}>
          <input type="radio" name={"correct-ai-" + item.id} checked={item.correctIndex === i} onChange={() => onChange({ ...item, correctIndex: i })} />
          <input type="text" value={opt} disabled={item.type === "vf"} onChange={(e) => setOption(i, e.target.value)} />
        </div>
      ))}
      {item.explanation && <div className="p2-airesult-explain">{item.explanation}</div>}
    </div>
  );
}

function AIGenerateView({ topics, onAddTopic, onAddMany, pushToast, apiKey, onChangeApiKey }) {
  const [topic, setTopic] = useState(topics[0]);
  const [concept, setConcept] = useState("");
  const [difficulty, setDifficulty] = useState("Intermedio");
  const [type, setType] = useState("mc");
  const [count, setCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await generateWithAI({ apiKey, topic, concept, difficulty, type, count });
      const mapped = raw.map((r) => ({
        id: uid(),
        text: r.text || "",
        options: Array.isArray(r.options) ? r.options : type === "vf" ? ["Verdadero", "Falso"] : ["", "", "", ""],
        correctIndex: typeof r.correctIndex === "number" ? r.correctIndex : 0,
        explanation: r.explanation || "",
        topic, difficulty, type,
        selected: true,
      }));
      setResults(mapped);
    } catch (e) {
      setError(e.message || "Ocurrió un error al generar preguntas.");
    } finally {
      setLoading(false);
    }
  };

  const updateResult = (updated) => setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  const discardResult = (id) => setResults((prev) => prev.filter((r) => r.id !== id));

  const commit = () => {
    const chosen = results.filter((r) => r.selected);
    if (chosen.length === 0) return;
    onAddMany(chosen.map((r) => ({ id: uid(), text: r.text, options: r.options, correctIndex: r.correctIndex, explanation: r.explanation, topic: r.topic, difficulty: r.difficulty, type: r.type, source: "ia" })));
    pushToast(chosen.length + " pregunta(s) agregadas al banco.");
    setResults(null);
  };

  if (!AI_FEATURE_ENABLED) {
    return (
      <div className="p2-view">
        <h2 className="p2-view-title">Generar preguntas con IA</h2>
        <div className="p2-empty">
          <Sparkles size={26} />
          <p>Esta función está desactivada.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p2-view">
      <h2 className="p2-view-title">Generar preguntas con IA</h2>
      <p className="p2-view-sub">Describe un tema o concepto y la IA propone varias preguntas para que revises antes de guardarlas.</p>

      <div className="p2-form-card">
        <h4><KeyRound size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Clave de API de Anthropic</h4>
        <label className="p2-field p2-field-full">
          <span>Se guarda solo en este navegador (localStorage), nunca se sube al repositorio.</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onChangeApiKey(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
          />
        </label>
        <p className="p2-hint" style={{ margin: "-2px 0 0" }}>
          Consíguela en{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            console.anthropic.com/settings/keys
          </a>. Es de uso personal: no la compartas ni la publiques en GitHub.
        </p>
      </div>

      <div className="p2-form-card">
        <div className="p2-form-grid">
          <label className="p2-field">
            <span>Tema</span>
            <TopicSelect topics={topics} value={topic} onChange={setTopic} onAddTopic={onAddTopic} />
          </label>
          <label className="p2-field">
            <span>Dificultad</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="p2-field">
            <span>Tipo</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="mc">Opción múltiple</option>
              <option value="vf">Verdadero / Falso</option>
            </select>
          </label>
          <label className="p2-field">
            <span>Cantidad</span>
            <input type="number" min={1} max={8} value={count} onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <label className="p2-field p2-field-full">
          <span>Concepto específico (opcional)</span>
          <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: capacitores en serie, flujo eléctrico a través de una esfera, regla de la mano derecha…" />
        </label>

        <div className="p2-modal-actions">
          <button className="p2-btn p2-btn-primary" onClick={generate} disabled={loading}>
            {loading ? <Loader2 size={14} className="p2-spin" /> : <Sparkles size={14} />}
            {loading ? "Generando…" : "Generar preguntas"}
          </button>
        </div>
        {error && <div className="p2-inline-error"><AlertCircle size={14} /> {error}</div>}
      </div>

      {results && (
        <div className="p2-ai-review">
          <div className="p2-ai-review-head">
            <h3>Revisa lo generado ({results.filter((r) => r.selected).length} de {results.length} seleccionadas)</h3>
            <button className="p2-btn p2-btn-ghost" onClick={generate} disabled={loading}><RefreshCw size={13} /> Regenerar</button>
          </div>
          {results.length === 0 ? (
            <p className="p2-view-sub">No quedan preguntas para revisar.</p>
          ) : (
            <div className="p2-ai-grid">
              {results.map((r) => <AIResultCard key={r.id} item={r} onChange={updateResult} onDiscard={discardResult} />)}
            </div>
          )}
          <div className="p2-modal-actions">
            <button className="p2-btn p2-btn-primary" disabled={results.filter((r) => r.selected).length === 0} onClick={commit}>
              <Check size={14} /> Agregar seleccionadas al banco
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BankView({ bank, topics, onEdit, onDelete, onClearAll }) {
  const [topicFilter, setTopicFilter] = useState("Todos");
  const [diffFilter, setDiffFilter] = useState("Todos");

  const filtered = bank.filter((q) => (topicFilter === "Todos" || q.topic === topicFilter) && (diffFilter === "Todos" || q.difficulty === diffFilter));

  return (
    <div className="p2-view">
      <h2 className="p2-view-title">Banco de preguntas</h2>
      <p className="p2-view-sub">{bank.length} pregunta(s) guardadas en total.</p>

      <div className="p2-filter-row">
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
          <option>Todos</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)}>
          <option>Todos</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {bank.length > 0 && (
          <button className="p2-btn p2-btn-ghost p2-btn-danger" onClick={() => { if (window.confirm("¿Vaciar todo el banco de preguntas? Esta acción no se puede deshacer.")) onClearAll(); }}>
            <Trash2 size={13} /> Vaciar banco
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="p2-empty"><Database size={26} /><p>No hay preguntas que coincidan con el filtro.</p></div>
      ) : (
        <div className="p2-bank-grid">
          {filtered.map((q) => <QuestionCard key={q.id} q={q} onEdit={onEdit} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

function VariantCard({ variant, expanded, onToggle }) {
  return (
    <div className="p2-variant">
      <button type="button" className="p2-variant-head" onClick={onToggle}>
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="p2-variant-label">{variant.label}</span>
        <span className="p2-variant-count">{variant.questions.length} preguntas</span>
      </button>
      {expanded && (
        <div className="p2-bank-grid p2-variant-body">
          {variant.questions.map((q) => <QuestionCard key={q.id} q={q} onEdit={() => {}} onDelete={() => {}} />)}
        </div>
      )}
    </div>
  );
}

function ExportView({ bank, topics, pushToast }) {
  const [selTopics, setSelTopics] = useState(() => new Set(topics));
  const [selDiff, setSelDiff] = useState(new Set(DIFFICULTIES));
  const [count, setCount] = useState(10);
  const [variantCount, setVariantCount] = useState(1);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [studentNamesText, setStudentNamesText] = useState("");
  const [variants, setVariants] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [title, setTitle] = useState("Evaluación de Física II");
  const [description, setDescription] = useState("Responde todas las preguntas. Tienes una sola oportunidad.");
  const [isQuiz, setIsQuiz] = useState(true);
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);
  const prevTopicsRef = useRef(topics);

  useEffect(() => {
    const prev = prevTopicsRef.current;
    const added = topics.filter((t) => !prev.includes(t));
    const removed = prev.filter((t) => !topics.includes(t));
    if (added.length || removed.length) {
      setSelTopics((s) => {
        const next = new Set(s);
        added.forEach((t) => next.add(t));
        removed.forEach((t) => next.delete(t));
        return next;
      });
    }
    prevTopicsRef.current = topics;
  }, [topics]);

  const pool = useMemo(() => bank.filter((q) => selTopics.has(q.topic) && selDiff.has(q.difficulty)), [bank, selTopics, selDiff]);
  const studentNames = useMemo(() => studentNamesText.split("\n").map((s) => s.trim()).filter(Boolean), [studentNamesText]);

  const toggleTopic = (t) => {
    const next = new Set(selTopics);
    next.has(t) ? next.delete(t) : next.add(t);
    setSelTopics(next); setVariants([]); setScript("");
  };
  const toggleDiff = (d) => {
    const next = new Set(selDiff);
    next.has(d) ? next.delete(d) : next.add(d);
    setSelDiff(next); setVariants([]); setScript("");
  };

  const drawVariants = () => {
    const n = Math.min(count, pool.length);
    const useNames = studentNames.length === variantCount;
    const list = [];
    for (let v = 0; v < variantCount; v++) {
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      let qs = shuffled.slice(0, n);
      if (shuffleOptions) qs = qs.map(shuffleQuestionOptions);
      list.push({ id: uid(), label: useNames ? studentNames[v] : "Prueba " + (v + 1), questions: qs });
    }
    setVariants(list);
    setExpanded(new Set());
    setScript("");
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const generateScript = () => {
    if (variants.length === 0) return;
    setScript(buildAppsScript({ title, description, isQuiz, variants }));
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      pushToast("Código copiado al portapapeles.");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      pushToast("No se pudo copiar automáticamente. Selecciona el código manualmente.", "error");
    }
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(variants, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pruebas-fisica2.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const totalQuestions = variants.reduce((sum, v) => sum + v.questions.length, 0);
  const drawLabel = variantCount <= 1 ? "Sortear preguntas" : "Sortear " + variantCount + " pruebas";

  return (
    <div className="p2-view">
      <h2 className="p2-view-title">Armar evaluaciones y exportar a Google Forms</h2>
      <p className="p2-view-sub">
        Filtra, sortea preguntas al azar y genera de una sola vez todas las pruebas que necesites: cada estudiante puede
        recibir un formulario distinto, con preguntas y alternativas en distinto orden.
      </p>

      <div className="p2-panels-row">
        <div className="p2-panel">
          <h4>Temas incluidos</h4>
          <div className="p2-checklist">
            {topics.map((t) => (
              <label key={t} className="p2-checkline">
                <input type="checkbox" checked={selTopics.has(t)} onChange={() => toggleTopic(t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="p2-panel">
          <h4>Dificultad</h4>
          <div className="p2-checklist">
            {DIFFICULTIES.map((d) => (
              <label key={d} className="p2-checkline">
                <input type="checkbox" checked={selDiff.has(d)} onChange={() => toggleDiff(d)} />
                <span>{d}</span>
              </label>
            ))}
          </div>
          <div className="p2-pool-count"><Database size={12} /> {pool.length} pregunta(s) disponibles con estos filtros</div>
        </div>
      </div>

      <div className="p2-form-card">
        <h4>Cuántas pruebas necesitas</h4>
        <div className="p2-form-grid">
          <label className="p2-field">
            <span>Preguntas por prueba</span>
            <input type="number" min={1} max={Math.max(1, pool.length)} value={count} onChange={(e) => setCount(Math.max(1, Math.min(pool.length || 1, Number(e.target.value) || 1)))} />
          </label>
          <label className="p2-field">
            <span>Cantidad de pruebas distintas</span>
            <input type="number" min={1} max={200} value={variantCount} onChange={(e) => setVariantCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
          </label>
          <label className="p2-checkline" style={{ alignSelf: "end" }}>
            <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} />
            <span>Mezclar también el orden de las alternativas en cada prueba</span>
          </label>
        </div>
        <label className="p2-field p2-field-full">
          <span>Nombres de estudiantes (opcional)</span>
          <textarea
            rows={3}
            value={studentNamesText}
            onChange={(e) => setStudentNamesText(e.target.value)}
            placeholder={"Un nombre por línea, en el mismo orden en que quieres asignar cada prueba.\nSi lo dejas vacío, las pruebas se numeran como Prueba 1, Prueba 2, etc."}
          />
        </label>
        <div className="p2-modal-actions">
          <button className="p2-btn p2-btn-primary" onClick={drawVariants} disabled={pool.length === 0}>
            <Shuffle size={14} /> {drawLabel}
          </button>
        </div>
      </div>

      {variants.length > 0 && (
        <>
          <h3 className="p2-subhead">Vista previa</h3>
          <p className="p2-view-sub">
            {variants.length} prueba(s) creadas, con un total de {totalQuestions} preguntas. Haz clic en una prueba para revisarla.
          </p>
          <div className="p2-variant-list">
            {variants.map((v) => (
              <VariantCard key={v.id} variant={v} expanded={expanded.has(v.id)} onToggle={() => toggleExpand(v.id)} />
            ))}
          </div>

          <div className="p2-form-card">
            <h4>Datos del formulario</h4>
            <label className="p2-field p2-field-full">
              <span>Título base</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <p className="p2-hint">Cada formulario se creará como "{title} - {variants[0].label}", "{title} - {variants.length > 1 ? variants[1].label : "…"}", y así sucesivamente.</p>
            <label className="p2-field p2-field-full">
              <span>Descripción / instrucciones</span>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="p2-checkline">
              <input type="checkbox" checked={isQuiz} onChange={(e) => setIsQuiz(e.target.checked)} />
              <span>Autocalificar como quiz (marca respuestas correctas y puntaje)</span>
            </label>

            <div className="p2-modal-actions">
              <button className="p2-btn p2-btn-ghost" onClick={downloadJSON}><Download size={14} /> Descargar JSON</button>
              <button className="p2-btn p2-btn-primary" onClick={generateScript}>
                <Sparkles size={14} /> Generar script para {variants.length > 1 ? "todos los formularios" : "Google Forms"}
              </button>
            </div>
          </div>
        </>
      )}

      {script && (
        <div className="p2-script-panel">
          <div className="p2-script-head">
            <h4>1. Copia este código de Apps Script</h4>
            <button className="p2-btn p2-btn-ghost" onClick={copyScript}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiado" : "Copiar código"}
            </button>
          </div>
          <pre className="p2-code">{script}</pre>

          <h4>2. Ejecútalo en tu cuenta de Google</h4>
          <ol className="p2-steps">
            <li>Abre <a href="https://script.google.com" target="_blank" rel="noreferrer">script.google.com <ExternalLink size={11} style={{ verticalAlign: -1 }} /></a> y crea un proyecto nuevo.</li>
            <li>Reemplaza el contenido del editor por el código copiado.</li>
            <li>Haz clic en el botón ▶ Ejecutar y autoriza los permisos que se soliciten (es tu propia cuenta de Google).</li>
            <li>
              El script crea {variants.length > 1 ? "cada uno de los formularios" : "el formulario"} y, al final, una hoja de
              cálculo nueva llamada "{title} - enlaces" con el enlace para el estudiante y el enlace de edición de cada prueba,
              lista para repartir.
            </li>
            <li>Si son muchas pruebas o preguntas, la ejecución puede tardar uno o dos minutos: no cierres la pestaña mientras corre.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [bank, setBank] = useState([]);
  const [customTopics, setCustomTopics] = useState([]);
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const topics = useMemo(() => [...DEFAULT_TOPICS, ...customTopics], [customTopics]);

  const pushToast = (msg, kind = "ok") => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("question-bank");
        if (res && res.value) setBank(JSON.parse(res.value));
      } catch (e) { /* nothing saved yet */ }
      try {
        const res2 = await storage.get("custom-topics");
        if (res2 && res2.value) setCustomTopics(JSON.parse(res2.value));
      } catch (e) { /* nothing saved yet */ }
      try {
        const res3 = await storage.get("anthropic-api-key");
        if (res3 && res3.value) setApiKey(res3.value);
      } catch (e) { /* nothing saved yet */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    storage.set("question-bank", JSON.stringify(bank)).catch(() => {});
  }, [bank, loaded]);

  useEffect(() => {
    if (!loaded) return;
    storage.set("custom-topics", JSON.stringify(customTopics)).catch(() => {});
  }, [customTopics, loaded]);

  useEffect(() => {
    if (!loaded) return;
    storage.set("anthropic-api-key", apiKey).catch(() => {});
  }, [apiKey, loaded]);

  const addQuestion = (q) => setBank((prev) => [q, ...prev]);
  const addMany = (qs) => setBank((prev) => [...qs, ...prev]);
  const updateQuestion = (updated) => {
    setBank((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    setEditing(null);
    pushToast("Cambios guardados.");
  };
  const deleteQuestion = (id) => { setBank((prev) => prev.filter((q) => q.id !== id)); pushToast("Pregunta eliminada."); };
  const clearAll = () => { setBank([]); pushToast("Banco vaciado."); };

  const addCustomTopic = (name) => {
    setCustomTopics((prev) => {
      const exists = [...DEFAULT_TOPICS, ...prev].some((t) => t.toLowerCase() === name.toLowerCase());
      if (exists) return prev;
      pushToast('Tema "' + name + '" creado.');
      return [...prev, name];
    });
  };
  const removeCustomTopic = (name) => {
    if (!window.confirm('¿Eliminar el tema "' + name + '"? Las preguntas ya creadas con este tema lo conservarán como texto.')) return;
    setCustomTopics((prev) => prev.filter((t) => t !== name));
  };

  const nav = [
    { id: "dashboard", label: "Resumen", icon: LayoutGrid },
    { id: "create", label: "Crear pregunta", icon: PlusCircle },
    { id: "ai", label: "Generar con IA", icon: Sparkles },
    { id: "bank", label: "Banco", icon: Database },
    { id: "export", label: "Armar y exportar", icon: Shuffle },
  ];

  return (
    <div className="p2-app">
      <style>{`
        .p2-app {
          --paper: #EEF0E2;
          --paper-2: #F8F9EF;
          --ink-panel: #1E2B42;
          --ink-panel-2: #283a56;
          --line: rgba(34,49,75,0.16);
          --line-strong: rgba(34,49,75,0.32);
          --heading: #22314B;
          --body: #33302A;
          --muted: #746F60;
          --red: #A8392E;
          --red-soft: rgba(168,57,46,0.10);
          --blue: #2C5C86;
          --green: #4C7A4F;
          --ochre: #A07423;
          font-family: 'Source Serif 4', Georgia, serif;
          color: var(--body);
          background: var(--paper);
          border: 1px solid var(--line-strong);
          display: flex;
          min-height: 640px;
          max-width: 1180px;
          margin: 0 auto;
          overflow: hidden;
        }
        .p2-app, .p2-app select, .p2-app input, .p2-app textarea, .p2-app button {
          font-family: 'Source Sans 3', Verdana, sans-serif;
        }
        .p2-app * { box-sizing: border-box; }
        .p2-app ::selection { background: var(--red); color: #fff; }

        .p2-sidebar {
          width: 226px;
          flex-shrink: 0;
          background: var(--ink-panel);
          padding: 26px 16px;
          display: flex;
          flex-direction: column;
          gap: 26px;
        }
        .p2-brand-title {
          font-family: 'Source Serif 4', Georgia, serif;
          font-weight: 600;
          font-size: 19px;
          line-height: 1.3;
          color: #F3F1E6;
          padding: 0 6px;
        }
        .p2-brand-sub {
          font-size: 12px;
          color: #A9B4C4;
          padding: 6px 6px 0;
          line-height: 1.5;
        }
        .p2-nav { display: flex; flex-direction: column; gap: 2px; }
        .p2-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-left: 3px solid transparent;
          color: #C3CBD8;
          font-size: 13.5px;
          cursor: pointer;
          text-align: left;
          border-radius: 0 3px 3px 0;
        }
        .p2-nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .p2-nav-item.active {
          background: rgba(255,255,255,0.07);
          border-left-color: var(--red);
          color: #fff;
          font-weight: 600;
        }
        .p2-nav-count { margin-left: auto; font-size: 11.5px; color: #97A2B4; }

        .p2-main {
          flex: 1;
          padding: 30px 36px 44px;
          overflow-y: auto;
          max-height: 700px;
          position: relative;
          background: var(--paper);
        }

        .p2-view-title {
          font-size: 23px;
          font-weight: 600;
          color: var(--heading);
          margin: 0 0 5px;
        }
        .p2-view-sub { color: var(--muted); font-size: 13.5px; margin: 0 0 22px; max-width: 62ch; line-height: 1.55; }
        .p2-subhead { font-size: 16px; font-weight: 600; color: var(--heading); margin: 26px 0 12px; padding-top: 20px; border-top: 1px solid var(--line); }

        .p2-stat-cards { display: flex; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; }
        .p2-stat-card { background: var(--paper-2); border: 1px solid var(--line); padding: 16px 22px; min-width: 140px; }
        .p2-stat-number { font-family: 'Source Serif 4', Georgia, serif; font-size: 30px; font-weight: 600; color: var(--red); line-height: 1; }
        .p2-stat-label { color: var(--muted); font-size: 12px; margin-top: 6px; }

        .p2-panels-row { display: flex; gap: 16px; flex-wrap: wrap; }
        .p2-panel { background: var(--paper-2); border: 1px solid var(--line); padding: 18px 20px; flex: 1; min-width: 260px; }
        .p2-panel h4 { margin: 0 0 12px; font-size: 13px; color: var(--heading); font-weight: 600; }
        .p2-panel-scroll { max-height: 320px; overflow-y: auto; padding-right: 4px; }

        .p2-statbar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
        .p2-statbar-label { width: 42%; font-size: 12px; color: var(--muted); flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .p2-statbar-track { flex: 1; height: 6px; background: var(--paper); border: 1px solid var(--line); }
        .p2-statbar-fill { height: 100%; background: var(--red); }
        .p2-statbar-value { width: 20px; text-align: right; font-size: 11.5px; color: var(--muted); }

        .p2-empty { border: 1px dashed var(--line-strong); padding: 40px 20px; text-align: center; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .p2-empty-actions { display: flex; gap: 10px; margin-top: 8px; }

        .p2-form-card { background: var(--paper-2); border: 1px solid var(--line); padding: 20px 22px; margin-bottom: 22px; }
        .p2-form-card h4 { margin: 0 0 14px; font-size: 13px; color: var(--heading); font-weight: 600; }
        .p2-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 14px; }
        .p2-field { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--muted); }
        .p2-field-full { margin-bottom: 14px; }
        .p2-field select, .p2-field input[type="text"], .p2-field input[type="number"], .p2-field textarea {
          background: var(--paper); border: 1px solid var(--line-strong); color: var(--body);
          padding: 9px 10px; font-size: 13.5px; border-radius: 2px;
        }
        .p2-field select:focus, .p2-field input:focus, .p2-field textarea:focus { outline: none; border-color: var(--red); }
        .p2-field textarea { resize: vertical; }

        .p2-topic-select { display: flex; flex-direction: column; gap: 4px; }
        .p2-topic-new-link { align-self: flex-start; background: none; border: none; color: var(--blue); font-size: 11.5px; cursor: pointer; padding: 2px 0; text-decoration: underline; text-underline-offset: 2px; }
        .p2-topic-add-row { display: flex; gap: 8px; align-items: center; }
        .p2-topic-add-row input { flex: 1; background: var(--paper); border: 1px solid var(--line-strong); color: var(--body); padding: 9px 10px; font-size: 13px; border-radius: 2px; }
        .p2-topic-add-btn { display: flex; align-items: center; gap: 6px; background: var(--blue); color: #fff; border: none; padding: 9px 12px; font-size: 12.5px; border-radius: 2px; cursor: pointer; white-space: nowrap; }
        .p2-topic-cancel-btn { background: none; border: 1px solid var(--line-strong); color: var(--muted); padding: 8px; border-radius: 2px; cursor: pointer; }
        .p2-topic-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .p2-topic-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--heading); background: var(--paper); border: 1px solid var(--line-strong); padding: 5px 8px; border-radius: 2px; }
        .p2-topic-chip button { background: none; border: none; color: var(--muted); cursor: pointer; display: flex; padding: 0; margin-left: 2px; }
        .p2-topic-chip button:hover { color: var(--red); }

        .p2-option-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .p2-option-row input[type="text"] { flex: 1; background: var(--paper); border: 1px solid var(--line-strong); color: var(--body); padding: 8px 10px; font-size: 13px; border-radius: 2px; }
        .p2-option-row input[type="radio"] { accent-color: var(--red); width: 16px; height: 16px; flex-shrink: 0; }

        .p2-checkline { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--body); padding: 5px 0; cursor: pointer; }
        .p2-checkline input { accent-color: var(--red); }
        .p2-checklist { display: flex; flex-direction: column; }

        .p2-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; font-size: 13px; font-weight: 500; border-radius: 2px; cursor: pointer; border: 1px solid transparent; }
        .p2-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .p2-btn-primary { background: var(--red); color: #fff; }
        .p2-btn-primary:hover:not(:disabled) { background: #8f2f25; }
        .p2-btn-ghost { background: transparent; border-color: var(--line-strong); color: var(--body); }
        .p2-btn-ghost:hover:not(:disabled) { background: var(--paper); }
        .p2-btn-danger { color: var(--red); border-color: rgba(168,57,46,0.35); }

        .p2-iconbtn { background: transparent; border: 1px solid var(--line-strong); color: var(--muted); padding: 6px; border-radius: 2px; cursor: pointer; display: inline-flex; }
        .p2-iconbtn:hover { color: var(--body); background: var(--paper); }
        .p2-iconbtn-danger:hover { color: var(--red); border-color: rgba(168,57,46,0.4); }

        .p2-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
        .p2-inline-error { display: flex; align-items: center; gap: 8px; color: var(--red); font-size: 12.5px; margin-top: 10px; }

        .p2-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 6px; }
        .p2-meta-item { display: inline-flex; align-items: center; font-size: 11.5px; color: var(--heading); margin-right: 14px; }
        .p2-meta-plain { color: var(--muted); }

        .p2-bank-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .p2-qcard { background: var(--paper-2); border: 1px solid var(--line); border-left: 3px solid var(--stripe); padding: 14px 16px; }
        .p2-qcard-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
        .p2-qcard-meta { display: flex; flex-wrap: wrap; }
        .p2-qcard-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .p2-qcard-topic { font-size: 11px; color: var(--blue); margin-bottom: 6px; }
        .p2-qcard-text { font-size: 13.5px; margin-bottom: 10px; line-height: 1.5; color: var(--body); }
        .p2-qcard-options { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .p2-qcard-options li { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
        .p2-opt-correct { color: var(--green) !important; }

        .p2-filter-row { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
        .p2-filter-row select { background: var(--paper-2); border: 1px solid var(--line-strong); color: var(--body); padding: 8px 10px; font-size: 12.5px; border-radius: 2px; }

        .p2-ai-review { margin-top: 8px; }
        .p2-ai-review-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
        .p2-ai-review-head h3 { font-size: 14.5px; font-weight: 600; margin: 0; color: var(--heading); }
        .p2-ai-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin-bottom: 18px; }
        .p2-airesult { background: var(--paper-2); border: 1px solid var(--blue); padding: 14px 16px; opacity: 1; transition: opacity 0.15s; }
        .p2-airesult-off { opacity: 0.45; border-color: var(--line); }
        .p2-airesult-text { width: 100%; background: var(--paper); border: 1px solid var(--line-strong); color: var(--body); padding: 8px 10px; font-size: 13px; margin-bottom: 8px; border-radius: 2px; }
        .p2-airesult-explain { font-size: 11.5px; color: var(--muted); margin-top: 8px; border-top: 1px solid var(--line); padding-top: 8px; }

        .p2-pool-count { margin-top: 12px; font-size: 11.5px; color: var(--muted); display: flex; align-items: center; gap: 6px; }

        .p2-hint { font-size: 11.5px; color: var(--muted); margin: -8px 0 14px; }
        .p2-app code { background: var(--paper); border: 1px solid var(--line); padding: 1px 5px; border-radius: 2px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; }

        .p2-variant-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
        .p2-variant { background: var(--paper-2); border: 1px solid var(--line); }
        .p2-variant-head { width: 100%; display: flex; align-items: center; gap: 10px; background: none; border: none; padding: 11px 14px; cursor: pointer; text-align: left; color: var(--heading); font-size: 13px; }
        .p2-variant-head:hover { background: var(--paper); }
        .p2-variant-label { font-weight: 600; }
        .p2-variant-count { margin-left: auto; font-size: 11.5px; color: var(--muted); }
        .p2-variant-body { padding: 4px 14px 16px; }

        .p2-script-panel { background: var(--paper-2); border: 1px solid var(--red); padding: 20px 22px; margin-top: 6px; }
        .p2-script-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px; }
        .p2-script-panel h4 { font-size: 13px; margin: 18px 0 10px; color: var(--red); }
        .p2-script-panel h4:first-child { margin-top: 0; }
        .p2-code {
          background: #1E2B42; color: #DCE6F0; border: 1px solid var(--line);
          padding: 14px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; line-height: 1.6;
          overflow-x: auto; max-height: 320px; overflow-y: auto; white-space: pre;
        }
        .p2-steps { padding-left: 20px; font-size: 13px; color: var(--body); line-height: 1.9; }
        .p2-steps a { color: var(--blue); }

        .p2-modal-overlay { position: fixed; inset: 0; background: rgba(24,32,26,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
        .p2-modal { background: var(--paper); border: 1px solid var(--red); padding: 24px 26px; width: 100%; max-width: 560px; max-height: 86vh; overflow-y: auto; }
        .p2-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
        .p2-modal-head h3 { font-size: 18px; margin: 0; color: var(--heading); font-weight: 600; }

        .p2-toast { position: absolute; top: 16px; right: 16px; display: flex; align-items: center; gap: 8px; background: var(--paper-2); border: 1px solid var(--line-strong); padding: 9px 14px; font-size: 12.5px; z-index: 60; }
        .p2-toast-error { border-color: var(--red); color: var(--red); }
        .p2-toast-ok { border-color: var(--green); color: var(--green); }

        .p2-spin { animation: p2-spin 0.9s linear infinite; }
        @keyframes p2-spin { to { transform: rotate(360deg); } }

        @media (max-width: 760px) {
          .p2-app { flex-direction: column; max-width: 100%; }
          .p2-sidebar { width: 100%; flex-direction: row; align-items: center; overflow-x: auto; padding: 14px; gap: 14px; }
          .p2-brand-title, .p2-brand-sub { display: none; }
          .p2-nav { flex-direction: row; }
          .p2-nav-item { border-left: none; border-bottom: 3px solid transparent; border-radius: 3px 3px 0 0; }
          .p2-nav-item.active { border-bottom-color: var(--red); }
          .p2-nav-count { display: none; }
          .p2-main { padding: 20px; max-height: none; }
        }
      `}</style>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet" />

      <aside className="p2-sidebar">
        <div>
          <div className="p2-brand-title">Física II</div>
          <div className="p2-brand-sub">Crea, genera y sortea preguntas para tus evaluaciones de electromagnetismo.</div>
        </div>
        <nav className="p2-nav">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.id} className={"p2-nav-item" + (view === n.id ? " active" : "")} onClick={() => setView(n.id)}>
                <Icon size={16} />
                <span>{n.label}</span>
                {n.id === "bank" && <span className="p2-nav-count">{bank.length}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="p2-main">
        <Toast toast={toast} />
        {!loaded ? (
          <div className="p2-empty"><Loader2 size={20} className="p2-spin" /><p>Cargando banco de preguntas…</p></div>
        ) : (
          <>
            {view === "dashboard" && (
              <DashboardView bank={bank} topics={topics} customTopics={customTopics} onAddTopic={addCustomTopic} onRemoveTopic={removeCustomTopic} onGo={setView} />
            )}
            {view === "create" && <CreateManualView topics={topics} onAddTopic={addCustomTopic} onAdd={addQuestion} pushToast={pushToast} />}
            {view === "ai" && <AIGenerateView topics={topics} onAddTopic={addCustomTopic} onAddMany={addMany} pushToast={pushToast} apiKey={apiKey} onChangeApiKey={setApiKey} />}
            {view === "bank" && <BankView bank={bank} topics={topics} onEdit={setEditing} onDelete={deleteQuestion} onClearAll={clearAll} />}
            {view === "export" && <ExportView bank={bank} topics={topics} pushToast={pushToast} />}
          </>
        )}
      </main>

      <QuestionEditModal question={editing} topics={topics} onAddTopic={addCustomTopic} onSave={updateQuestion} onClose={() => setEditing(null)} />
    </div>
  );
}
