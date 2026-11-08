import { useDeferredValue, useMemo, useState } from "react";
import type { Project } from "interactives-player";
import { store, useEditor } from "../store/store";
import { Modal } from "./ProjectModals";
import { applyFix, fixValues } from "../lib/a11y/fixes";
import { loadReviewed, toggleReviewed } from "../lib/a11y/reviewed";
import {
  checkBeforeShare,
  loadFine,
  setFine,
  type FineMap,
  type ShareGroup,
  type ShareItem,
} from "../lib/before-share";
import { goToPage } from "../lib/commands";
import { openBehaviours } from "./BehaviourDialog";
import { removeUnusedAssets } from "../panels/UsagePanel";
import { analyzeUsage } from "../lib/dependencies";
import { track } from "../lib/analytics";

/** Show where something is: its page, and the layer selected. */
export function reveal(item: ShareItem): void {
  const s = store();
  if (item.artboardId) goToPage(item.artboardId);
  if (item.nodeId && item.artboardId)
    s.select([item.nodeId], { artboardId: item.artboardId });
}

/** What the list is for: the check (and the mark of fine) read the project, so it follows every change made while it is open. */
export function useShareGroups(): {
  groups: ShareGroup[];
  fine: FineMap;
  mark: (item: ShareItem[], fine: boolean) => void;
  project: Project;
} {
  const project = useEditor((st) => st.project);
  const analysed = useDeferredValue(project);
  const [fine, setFineState] = useState<FineMap>(() => loadFine(project.id));
  const groups = useMemo(
    () => checkBeforeShare(analysed, fine),
    [analysed, fine],
  );
  return {
    groups,
    fine,
    project,
    mark: (items, on) => {
      //An accessibility finding keeps its own mark too, so the panel and this list agree
      for (const i of items)
        if (i.finding) toggleReviewedTo(project.id, i.finding.id, on);
      setFineState(
        setFine(
          project.id,
          items.map((i) => i.key),
          on,
        ),
      );
    },
  };
}

function toggleReviewedTo(
  projectId: string,
  findingId: string,
  on: boolean,
): void {
  if (!!loadReviewed(projectId)[findingId] !== on)
    toggleReviewed(projectId, findingId);
}

const SHOWN = 4;

/** A description typed straight into the list, for a picture or video that has none. */
function DescribeIt({ item, onDone }: { item: ShareItem; onDone: () => void }) {
  const fix = item.finding?.fix;
  const [text, setText] = useState(fix?.input?.value ?? "");
  if (!fix?.input) return null;
  const add = () => {
    if (!fixValues(fix, text))
      return store().toast("Type the description first", "error");
    track("feature", "before-share-fix", { thing: "alt-text" });
    store().update((d) => void applyFix(d as Project, fix, text));
    onDone();
  };
  return (
    <form
      className="share-describe"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input
        value={text}
        placeholder={fix.input.placeholder}
        aria-label={`${fix.input.label} for ${item.name}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <button type="submit" className="btn">
        Add it
      </button>
    </form>
  );
}

function GroupView({
  group,
  onClose,
  mark,
  project,
  startOpen,
}: {
  group: ShareGroup;
  onClose: () => void;
  mark: (items: ShareItem[], fine: boolean) => void;
  project: Project;
  startOpen: boolean;
}) {
  const [all, setAll] = useState(false);
  //One line per group; what is in it, and the fixes, only once it is opened
  const [open, setOpen] = useState(startOpen);
  const shown = all ? group.items : group.items.slice(0, SHOWN);
  const s = store();
  const quick =
    group.id === "contrast"
      ? group.items.filter((i) => i.finding?.fix && !i.finding.fix.input)
      : [];
  const unused = group.id === "unused-media" || group.id === "size";
  const leave = (fn: () => void) => () => (onClose(), fn());
  return (
    <li className="share-group" data-check={group.id}>
      <div className="share-group-head">
        <button
          type="button"
          className="share-group-toggle"
          aria-expanded={open}
          aria-controls={`share-group-${group.id}`}
          onClick={() => setOpen(!open)}
        >
          <span className="share-group-chev" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <strong>{group.title}</strong>
        </button>
        <a
          className="help-link"
          href={`#/help/${group.help}`}
          title="More about this"
          aria-label={`Help: ${group.title}`}
          onClick={(e) => {
            e.preventDefault();
            void import("../help/Help").then((m) =>
              m.openHelp(group.help.split("#")[0], group.help.split("#")[1]),
            );
          }}
        >
          ?
        </a>
      </div>
      {open && (
        <div className="share-group-body" id={`share-group-${group.id}`}>
          <p className="muted small">{group.why}</p>
          <ul className="share-items">
            {shown.map((i) => (
              <li key={i.key}>
                <div className="share-item-row">
                  <span
                    className="share-item-name"
                    title={i.name.length > 110 ? i.name : undefined}
                  >
                    {i.name.length > 110
                      ? `${i.name.slice(0, 109)}...`
                      : i.name}
                    {i.where && <span className="muted"> {i.where}</span>}
                  </span>
                  {(i.artboardId || i.nodeId) && (
                    <button
                      className="btn"
                      title="Show me where it is"
                      onClick={leave(
                        () => (
                          reveal(i),
                          group.id === "placeholder-text" &&
                            i.nodeId &&
                            s.set({ editingTextId: i.nodeId })
                        ),
                      )}
                    >
                      Go there
                    </button>
                  )}
                  {group.id === "dead-buttons" && i.nodeId && i.artboardId && (
                    <button
                      className="btn"
                      title="Choose what happens when it is clicked"
                      onClick={leave(
                        () => (
                          reveal(i),
                          openBehaviours({
                            abId: i.artboardId!,
                            layerId: i.nodeId!,
                            trigger: "click",
                          })
                        ),
                      )}
                    >
                      Choose what it does
                    </button>
                  )}
                  <button
                    className="btn quiet"
                    title="You looked, and it is meant to be like this: leave it off the list"
                    onClick={() => mark([i], true)}
                  >
                    This is fine
                  </button>
                </div>
                {group.id === "alt-text" && (
                  <DescribeIt item={i} onDone={() => undefined} />
                )}
              </li>
            ))}
          </ul>
          {group.items.length > SHOWN && (
            <button className="link-btn inline" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${group.items.length}`}
            </button>
          )}
          <div className="share-group-actions">
            {quick.length > 0 && (
              <button
                className="btn"
                onClick={() => {
                  const fixes = quick.map((i) => i.finding!.fix!);
                  track("feature", "before-share-fix", {
                    thing: "contrast",
                    sum: { fixes: fixes.length },
                  });
                  s.update(
                    (d) =>
                      void fixes.forEach((fx) => applyFix(d as Project, fx)),
                  );
                  s.toast(
                    `${fixes.length} fix${fixes.length === 1 ? "" : "es"} applied. Undo with Ctrl+Z`,
                  );
                }}
              >
                Fix{" "}
                {quick.length === group.items.length
                  ? "them"
                  : `${quick.length} of them`}{" "}
                for me
              </button>
            )}
            {unused && analyzeUsage(project).assets.some((a) => a.unused) && (
              <button
                className="btn"
                onClick={() => {
                  track("feature", "before-share-fix", {
                    thing: "unused-media",
                  });
                  void removeUnusedAssets(analyzeUsage(project), project.id);
                }}
              >
                Remove the files nothing uses…
              </button>
            )}
            {(group.id === "broken" ||
              group.id === "unused-media" ||
              group.id === "size") && (
              <button
                className="btn"
                onClick={leave(() =>
                  s.set({
                    bottomTab: group.id === "broken" ? "usage" : "usage",
                  }),
                )}
              >
                Open Usage
              </button>
            )}
            {group.id === "size" && (
              <button
                className="btn"
                onClick={leave(
                  () =>
                    void import("../lib/dock").then((m) =>
                      m.setDock((l) => m.showPanel(l, "assets")),
                    ),
                )}
              >
                Open Assets
              </button>
            )}
            {group.id === "template" && (
              <button
                className="btn"
                title="Open the checklist"
                onClick={leave(() => s.set({ bottomTab: "checklist" }))}
              >
                Open the checklist
              </button>
            )}
            {group.items.length > 1 && (
              <button
                className="btn quiet"
                title="You looked at all of these, and they are meant to be like this"
                onClick={() => mark(group.items, true)}
              >
                All of these are fine
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * "Before you share": what is most likely wrong, each with a way to go and look and, where it is safe, a way to fix it. It opens
 * when Share or an export is pressed and there is something to look at; "Share anyway" carries on regardless.
 */
export function BeforeYouShareModal({
  what,
  onGo,
  onClose,
}: {
  what: "share" | "export";
  onGo?: () => void;
  onClose: () => void;
}) {
  const { groups, fine, mark, project } = useShareGroups();
  const finePicked = Object.keys(fine).length;
  const n = groups.length;
  return (
    <Modal
      title="Before you share"
      help="before-you-share"
      onClose={onClose}
      className="share-modal before-share-modal"
    >
      <div className="share-body">
        {n === 0 ? (
          <p>
            <strong>Nothing to look at.</strong> The buttons do something, every
            page can be reached, no sample words are left, pictures are
            described and the files are a sensible size.
          </p>
        ) : (
          <p>
            <strong>
              {n} {n === 1 ? "thing" : "things"} to look at.
            </strong>{" "}
            <span className="muted">Open one to see where, and to fix it.</span>
          </p>
        )}
        <ul className="share-groups">
          {groups.map((g) => (
            <GroupView
              key={g.id}
              group={g}
              onClose={onClose}
              mark={mark}
              project={project}
              startOpen={n === 1}
            />
          ))}
        </ul>
        <div className="row share-gate-actions">
          {onGo ? (
            <button
              className={`btn${n ? "" : " primary"}`}
              onClick={() => {
                track("feature", "before-share-go", {
                  thing: what,
                  detail: { open: n },
                });
                onClose();
                onGo();
              }}
            >
              {what === "share"
                ? n
                  ? "Share anyway"
                  : "Carry on to Share"
                : n
                  ? "Export anyway"
                  : "Carry on to Export"}
            </button>
          ) : null}
          <button className="btn" onClick={onClose}>
            {n ? "Keep working" : "Close"}
          </button>
          {finePicked > 0 && (
            <button
              className="link-btn inline"
              title="Show the things you marked as fine again"
              onClick={() =>
                mark(
                  Object.keys(fine).map((key) => ({ key, name: key })),
                  false,
                )
              }
            >
              Forget what I marked as fine ({finePicked})
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** One line for the top of the Share dialog: how it stands, and a way to open the list. */
export function BeforeShareLine({ onOpen }: { onOpen: () => void }) {
  const { groups } = useShareGroups();
  return groups.length ? (
    <p className="share-check-line warn" role="status">
      <strong>
        {groups.length} {groups.length === 1 ? "thing" : "things"} to look at
        first.
      </strong>{" "}
      <button className="link-btn inline" onClick={onOpen}>
        Show me
      </button>
    </p>
  ) : (
    <p className="share-check-line ok" role="status">
      <span aria-hidden="true">✓ </span>Nothing to look at before sharing.
    </p>
  );
}
