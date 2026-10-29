import { Bug, CheckCheck, Upload } from "lucide-react";
import { REPORT_A_BUG_GUIDE } from "./content";
import "./bug-guide.css";

/** HTML/CSS illustrations ported from Almond's help/step-mocks, with no real screenshots or user data. */
function StepMock({ step, caption }: { step: number; caption: string }) {
  return <figure className="bug-guide__mock">
    <div className="bug-guide__frame">
      <div className="bug-guide__frame-bar"><span /><span /><span /><strong>{["Every page", "Report a bug", "My bug reports"][step]}</strong></div>
      <div className="bug-guide__frame-content">
        {step === 0 ? <div className="bug-guide__mock-page"><span className="bug-guide__mock-fab"><Bug size={16} aria-hidden="true" /></span></div> : null}
        {step === 1 ? <>
          <div className="bug-guide__mock-description">อธิบายปัญหาที่เจอ...</div>
          <div className="bug-guide__mock-drop"><Upload size={20} aria-hidden="true" /><span>แนบภาพหน้าจอ</span><small>JPG · PNG · WebP · GIF</small></div>
          <div className="bug-guide__mock-actions"><span>Send</span></div>
        </> : null}
        {step === 2 ? <>
          <div className="bug-guide__mock-row"><span>กด Save แล้วค้าง</span><span className="bug-guide__mock-status bug-guide__mock-status--progress">In progress</span></div>
          <div className="bug-guide__mock-row"><span>ยอดรวมไม่ตรง</span><span className="bug-guide__mock-status bug-guide__mock-status--done">Done</span></div>
        </> : null}
      </div>
    </div>
    <figcaption>{caption}</figcaption>
  </figure>;
}

export function BugGuide() {
  return <section id="report-a-bug" className="bug-guide" aria-labelledby="report-a-bug-title">
    <p className="bug-guide__kicker">App · Guide</p>
    <h2 id="report-a-bug-title">{REPORT_A_BUG_GUIDE.title}</h2>
    <p className="bug-guide__intro">{REPORT_A_BUG_GUIDE.summary}</p>
    <div className="bug-guide__section-label"><span>Steps</span><span aria-hidden="true" /></div>
    <div className="bug-guide__timeline">
      <span className="bug-guide__timeline-line" aria-hidden="true" />
      {REPORT_A_BUG_GUIDE.steps.map((step, index) => <div className="bug-guide__step" key={step.title}>
        <span className="bug-guide__number">{index + 1}</span>
        <div className="bug-guide__step-content">
          <div className="bug-guide__step-heading"><h3>{step.title}</h3><span>Everyone</span></div>
          <div className="bug-guide__step-body">{step.description}<StepMock step={index} caption={step.caption} /></div>
        </div>
      </div>)}
    </div>
    {REPORT_A_BUG_GUIDE.callouts.map((callout, index) => <aside className="bug-guide__callout" key={callout.title}>
      {index === 0 ? <Bug size={19} aria-hidden="true" /> : <CheckCheck size={19} aria-hidden="true" />}
      <div><h4>{callout.title}</h4><p>{callout.description}</p></div>
    </aside>)}
  </section>;
}
