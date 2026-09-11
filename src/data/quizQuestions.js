// src/data/quizQuestions.js
// 20 High-Yield Case-Based Single Best Answer (SBA) Medical Questions for IMF 2026

export const QUIZ_QUESTIONS = [
  {
    id: 1,
    specialty: "Cardiology",
    title: "Question 1 (Cardiology)",
    scenario: "A 64-year-old man presents to the emergency department with sudden-onset, severe \"tearing\" pain in his chest that radiates between his shoulder blades. His blood pressure is 185/105 mmHg in his right arm and 130/75 mmHg in his left arm. Heart rate is 96 bpm. An early diastolic murmur is heard at the right sternal border. An ECG shows sinus tachycardia with no ST-segment elevation.",
    prompt: "What is the most definitive diagnostic investigation of choice?",
    options: [
      { key: "A", text: "Transthoracic echocardiogram (TTE)" },
      { key: "B", text: "CT angiogram of the chest and abdomen" },
      { key: "C", text: "Coronary angiography" },
      { key: "D", text: "High-sensitivity cardiac troponin I" },
      { key: "E", text: "D-dimer assay" }
    ],
    correctAnswer: "B",
    explanation: "The clinical picture (tearing chest pain radiating to the back, blood pressure discrepancy between arms, and new aortic regurgitation murmur) is classic for acute aortic dissection (Stanford Type A). In a hemodynamically stable patient, a contrast-enhanced CT angiogram (CTA) of the chest and abdomen is the gold-standard initial imaging modality."
  },
  {
    id: 2,
    specialty: "Emergency / Trauma",
    title: "Question 2 (Emergency / Trauma)",
    scenario: "A 22-year-old man is brought to the resuscitation bay following a motor vehicle collision. He is cyanotic, tachypneic (respiratory rate 34 breaths/min), and hypotensive (blood pressure 78/48 mmHg). Examination reveals distended neck veins, absent breath sounds on the right hemithorax, and tracheal deviation to the left side.",
    prompt: "What is the most appropriate immediate management?",
    options: [
      { key: "A", text: "Immediate endotracheal intubation" },
      { key: "B", text: "Insertion of an intercostal chest drain in the 5th intercostal space" },
      { key: "C", text: "Urgent portable chest X-ray" },
      { key: "D", text: "Needle decompression in the 2nd intercostal space midclavicular line" },
      { key: "E", text: "Intravenous fluid resuscitation with 2 liters of normal saline" }
    ],
    correctAnswer: "D",
    explanation: "The presentation signifies a tension pneumothorax (hypotension, tracheal deviation, absent unilateral breath sounds). This is a clinical diagnosis requiring immediate needle decompression to relieve intra-thoracic pressure before attempting a tube thoracostomy or obtaining imaging."
  },
  {
    id: 3,
    specialty: "Respiratory",
    title: "Question 3 (Respiratory)",
    scenario: "A 34-year-old woman who returned from a 12-hour international flight 3 days ago presents with sudden-onset dyspnea and right-sided pleuritic chest pain. Her heart rate is 112 bpm, blood pressure is 124/80 mmHg, and oxygen saturation is 93% on ambient air. Physical examination reveals clear lungs bilaterally and a mild calf swelling on the right leg.",
    prompt: "What is the most appropriate next step in management?",
    options: [
      { key: "A", text: "Serum D-dimer testing" },
      { key: "B", text: "CT Pulmonary Angiogram (CTPA)" },
      { key: "C", text: "Empirical therapeutic low-molecular-weight heparin (LMWH) while awaiting imaging" },
      { key: "D", text: "Transthoracic echocardiography" },
      { key: "E", text: "Ventilation-Perfusion (V/Q) scan" }
    ],
    correctAnswer: "C",
    explanation: "The patient has a high pre-test probability (Wells score > 4) for pulmonary embolism (PE). In high-probability cases with no contraindications, therapeutic anticoagulation (e.g., LMWH) should be initiated immediately prior to confirming the diagnosis with CTPA."
  },
  {
    id: 4,
    specialty: "Gastroenterology",
    title: "Question 4 (Gastroenterology)",
    scenario: "A 48-year-old woman presents with a 12-hour history of severe, constant epigastric pain radiating to her back, accompanied by intractable vomiting. Her temperature is 38.0°C (100.4°F), blood pressure is 105/65 mmHg, and heart rate is 108 bpm. Epigastric tenderness and voluntary guarding are noted. Serum amylase is 1,240 U/L (reference: 30–110 U/L).",
    prompt: "What is the most common underlying etiology for this condition?",
    options: [
      { key: "A", text: "Chronic alcohol abuse" },
      { key: "B", text: "Gallstone disease" },
      { key: "C", text: "Hypertriglyceridemia" },
      { key: "D", text: "Medication-induced (e.g., thiazides)" },
      { key: "E", text: "Autoimmune pancreatitis" }
    ],
    correctAnswer: "B",
    explanation: "The patient presents with acute pancreatitis (pain radiating to the back and amylase >3 times the upper limit of normal). Globally, gallstones (biliary disease) represent the leading cause (~40–50%), followed by alcohol misuse."
  },
  {
    id: 5,
    specialty: "Endocrinology",
    title: "Question 5 (Endocrinology)",
    scenario: "A 19-year-old man with Type 1 Diabetes Mellitus is brought to the emergency department feeling drowsy, confused, and nauseated. He missed his insulin doses over the last two days due to a viral illness. Vitals: BP 90/60 mmHg, HR 122 bpm, RR 28 breaths/min with deep, rapid respirations. Capillary glucose is 28 mmol/L (504 mg/dL), venous pH is 7.15, and serum ketones are 4.8 mmol/L.",
    prompt: "What is the initial priority in this patient’s pharmacological management?",
    options: [
      { key: "A", text: "Intravenous sodium bicarbonate bolus" },
      { key: "B", text: "Intravenous bolus of regular insulin" },
      { key: "C", text: "Intravenous infusion of 0.9% normal saline" },
      { key: "D", text: "Intravenous potassium chloride infusion" },
      { key: "E", text: "Subcutaneous long-acting insulin analog" }
    ],
    correctAnswer: "C",
    explanation: "In diabetic ketoacidosis (DKA), aggressive fluid resuscitation with isotonic crystalloid (0.9% normal saline) is the foremost priority to restore intravascular volume, improve renal perfusion, and reduce circulating counter-regulatory hormones before or alongside starting fixed-rate intravenous insulin."
  },
  {
    id: 6,
    specialty: "Nephrology",
    title: "Question 6 (Nephrology)",
    scenario: "A 67-year-old man with chronic kidney disease (baseline eGFR 22 mL/min/1.73m²) presents with generalized weakness. Routine lab results show a serum potassium level of 7.2 mmol/L. A 12-lead ECG demonstrates tall, peaked T waves and widening of the QRS complexes.",
    prompt: "What is the most appropriate first agent to administer?",
    options: [
      { key: "A", text: "Nebulized salbutamol" },
      { key: "B", text: "Intravenous calcium gluconate (10%)" },
      { key: "C", text: "Intravenous insulin with dextrose" },
      { key: "D", text: "Oral sodium zirconium cyclosilicate" },
      { key: "E", text: "Intravenous furosemide" }
    ],
    correctAnswer: "B",
    explanation: "ECG changes in severe hyperkalemia indicate myocardial instability. Calcium gluconate (or calcium chloride) does not lower serum potassium, but it membrane-stabilizes the cardiac myocytes immediately, preventing lethal arrhythmias. Shifting agents (insulin/dextrose) follow right after."
  },
  {
    id: 7,
    specialty: "Neurology",
    title: "Question 7 (Neurology)",
    scenario: "A 52-year-old accountant experiences a sudden, explosive headache while lifting weights, describing it as the \"worst headache of my life.\" Within an hour, he develops neck stiffness and photophobia. On arrival, GCS is 14/15. A non-contrast CT head performed 2 hours after symptom onset is reported as completely normal.",
    prompt: "What is the most appropriate next step?",
    options: [
      { key: "A", text: "Discharge home with oral triptans for a severe migraine" },
      { key: "B", text: "Perform a lumbar puncture (LP) immediately" },
      { key: "C", text: "Perform a lumbar puncture at least 12 hours after symptom onset" },
      { key: "D", text: "Perform an MRI brain with contrast" },
      { key: "E", text: "Perform an electroencephalogram (EEG)" }
    ],
    correctAnswer: "C",
    explanation: "The scenario depicts a suspected subarachnoid hemorrhage (SAH). When a non-contrast CT head is negative or inconclusive, a lumbar puncture to check for xanthochromia (spectrophotometry) is indicated, ideally performed at least 12 hours after headache onset to allow sufficient enzymatic breakdown of RBCs into bilirubin."
  },
  {
    id: 8,
    specialty: "Rheumatology",
    title: "Question 8 (Rheumatology)",
    scenario: "A 72-year-old woman presents with a 2-week history of right-sided temporal headache, scalp tenderness when brushing her hair, and pain in her jaw muscles when chewing meat. Blood tests show an Erythrocyte Sedimentation Rate (ESR) of 98 mm/hr and C-reactive protein of 64 mg/L.",
    prompt: "What is the most appropriate next clinical step?",
    options: [
      { key: "A", text: "Schedule an outpatient temporal artery biopsy before starting treatment" },
      { key: "B", text: "Administer high-dose oral prednisolone immediately" },
      { key: "C", text: "Prescribe carbamazepine for trigeminal neuralgia" },
      { key: "D", text: "Order an urgent CT head scan" },
      { key: "E", text: "Initiate methotrexate and folic acid" }
    ],
    correctAnswer: "B",
    explanation: "The presentation is pathognomonic for Giant Cell (Temporal) Arteritis. Systemic corticosteroids (e.g., prednisolone 40–60 mg/day, or IV methylprednisolone if visual symptoms exist) must be started immediately to prevent irreversible ischemic optic neuropathy (blindness). Biopsy can be done within 1–2 weeks without losing diagnostic accuracy."
  },
  {
    id: 9,
    specialty: "Infectious Diseases",
    title: "Question 9 (Infectious Diseases)",
    scenario: "A 21-year-old university student is brought to the clinic with fever, lethargy, severe headache, and neck stiffness. On examination, she is febrile (39.2°C) and has non-blanching purpuric lesions on both lower extremities. Kernig's and Brudzinski's signs are positive.",
    prompt: "What is the most appropriate immediate medical intervention?",
    options: [
      { key: "A", text: "Perform an immediate lumbar puncture" },
      { key: "B", text: "Obtain a contrast-enhanced CT head" },
      { key: "C", text: "Administer intravenous ceftriaxone" },
      { key: "D", text: "Administer oral acyclovir" },
      { key: "E", text: "Isolate the patient and observe vitals for 4 hours" }
    ],
    correctAnswer: "C",
    explanation: "In suspected meningococcal meningitis/sepsis, empirical antibiotic therapy (e.g., high-dose third-generation cephalosporin such as ceftriaxone) should never be delayed for diagnostic investigations (lumbar puncture or CT imaging)."
  },
  {
    id: 10,
    specialty: "Pediatrics",
    title: "Question 10 (Pediatrics)",
    scenario: "A 4-week-old male infant presents with repeated non-bilious, projectile vomiting immediately following feeds for the past 4 days. He remains eager to feed right after vomiting. Physical examination reveals signs of mild dehydration and a small, firm, olive-shaped mass in the right upper quadrant.",
    prompt: "Which electrolyte abnormality is most characteristically associated with this condition?",
    options: [
      { key: "A", text: "Hyperkalemic, hyperchloremic metabolic acidosis" },
      { key: "B", text: "Hypokalemic, hypochloremic metabolic alkalosis" },
      { key: "C", text: "Hyponatremic, hyperkalemic metabolic acidosis" },
      { key: "D", text: "Hypernatremic, hypokalemic metabolic alkalosis" },
      { key: "E", text: "Normal electrolytes with high anion gap acidosis" }
    ],
    correctAnswer: "B",
    explanation: "Infantile hypertrophic pyloric stenosis leads to loss of gastric hydrochloric acid and potassium through repeated vomiting, producing the classic biochemical profile of hypochloremic, hypokalemic metabolic alkalosis with paradoxical aciduria."
  },
  {
    id: 11,
    specialty: "Obstetrics",
    title: "Question 11 (Obstetrics)",
    scenario: "A 28-year-old primigravida at 34 weeks of gestation presents with severe bilateral frontal headache, blurred vision, and epigastric discomfort. Her blood pressure is 168/112 mmHg on two occasions 4 hours apart. Urinalysis shows 3+ protein. Deep tendon reflexes are 4+ with sustained ankle clonus.",
    prompt: "What is the drug of choice to prevent generalized tonic-clonic seizures in this patient?",
    options: [
      { key: "A", text: "Intravenous diazepam" },
      { key: "B", text: "Intravenous magnesium sulfate" },
      { key: "C", text: "Intravenous phenytoin" },
      { key: "D", text: "Oral levetiracetam" },
      { key: "E", text: "Intravenous hydralazine" }
    ],
    correctAnswer: "B",
    explanation: "The patient has severe preeclampsia with imminent eclampsia. Magnesium sulfate is the established drug of choice for the prevention and treatment of eclamptic seizures (superior to diazepam or phenytoin)."
  },
  {
    id: 12,
    specialty: "Gynecology",
    title: "Question 12 (Gynecology)",
    scenario: "A 26-year-old woman presents to the acute gynaecology unit with a 2-day history of acute right iliac fossa pain and light vaginal spotting. Her last menstrual period was 7 weeks ago. Vital signs: BP 95/60 mmHg, HR 105 bpm. Abdominal examination reveals localized peritonism in the right lower quadrant and cervical motion tenderness on bimanual exam. A urine pregnancy test is positive.",
    prompt: "What is the most definitive next diagnostic investigation?",
    options: [
      { key: "A", text: "Transvaginal ultrasonography (TVUS)" },
      { key: "B", text: "Abdominal plain radiograph" },
      { key: "C", text: "Serum CA-125" },
      { key: "D", text: "Serum progesterone level" },
      { key: "E", text: "Diagnostic laparoscopy directly without imaging" }
    ],
    correctAnswer: "A",
    explanation: "In suspected ectopic pregnancy, the combination of a positive pregnancy test, localized pelvic pain, and vaginal bleeding warrants an urgent transvaginal ultrasound to identify an intrauterine vs. extrauterine gestational sac."
  },
  {
    id: 13,
    specialty: "General Surgery",
    title: "Question 13 (General Surgery)",
    scenario: "A 70-year-old man who underwent a dynamic hip screw fixation 4 days ago develops sudden, severe abdominal distension, obstipation, and nausea. He has no prior history of abdominal surgeries. Abdominal exam reveals massive non-tender tympanitic distension. An abdominal radiograph demonstrates marked colonic dilatation without mechanical cut-off, with a cecal diameter of 11 cm.",
    prompt: "What is the most likely diagnosis?",
    options: [
      { key: "A", text: "Sigmoid volvulus" },
      { key: "B", text: "Cecal volvulus" },
      { key: "C", text: "Acute colonic pseudo-obstruction (Ogilvie syndrome)" },
      { key: "D", text: "Small bowel obstruction secondary to adhesions" },
      { key: "E", text: "Toxic megacolon secondary to C. difficile" }
    ],
    correctAnswer: "C",
    explanation: "Acute colonic pseudo-obstruction (Ogilvie syndrome) is characterized by massive non-mechanical dilatation of the colon, commonly triggered by orthopedic surgery, trauma, severe medical illness, or electrolyte derangements in elderly patients."
  },
  {
    id: 14,
    specialty: "Hematology",
    title: "Question 14 (Hematology)",
    scenario: "A 35-year-old woman presents with fluctuating confusion, petechiae, fever, and jaundice. Laboratory tests demonstrate hemoglobin of 7.8 g/dL, platelet count of 18 × 10⁹/L, elevated indirect bilirubin, and elevated serum LDH. Peripheral blood smear reveals prominent schistocytes. Prothrombin time (PT) and activated partial thromboplastin time (aPTT) are normal.",
    prompt: "What is the mainstay of initial treatment for this condition?",
    options: [
      { key: "A", text: "Platelet transfusion" },
      { key: "B", text: "Therapeutic plasma exchange (plasmapheresis)" },
      { key: "C", text: "Intravenous heparin infusion" },
      { key: "D", text: "Intravenous immunoglobulin (IVIG)" },
      { key: "E", text: "Splenectomy" }
    ],
    correctAnswer: "B",
    explanation: "This is the classic pentad of Thrombotic Thrombocytopenic Purpura (TTP) (microangiopathic hemolytic anemia, thrombocytopenia, fever, neurological symptoms, renal dysfunction) caused by ADAMTS13 deficiency. Plasma exchange (PEX) is life-saving and must be initiated promptly; platelet transfusions are contraindicated."
  },
  {
    id: 15,
    specialty: "Psychiatry",
    title: "Question 15 (Psychiatry)",
    scenario: "A 29-year-old man with a history of schizophrenia was initiated on haloperidol 4 days ago. He is brought to the emergency department in a state of stupor. Examination reveals extreme \"lead-pipe\" muscular rigidity, diaphoresis, autonomic instability (BP 175/100 mmHg, HR 125 bpm), and a temperature of 39.8°C (103.6°F). Serum creatine kinase (CK) is 42,000 U/L.",
    prompt: "What is the primary underlying diagnosis?",
    options: [
      { key: "A", text: "Serotonin syndrome" },
      { key: "B", text: "Neuroleptic malignant syndrome (NMS)" },
      { key: "C", text: "Malignant hyperthermia" },
      { key: "D", text: "Acute dystonic reaction" },
      { key: "E", text: "Anticholinergic toxicity" }
    ],
    correctAnswer: "B",
    explanation: "Neuroleptic Malignant Syndrome (NMS) is an idiosyncratic reaction to dopamine antagonists characterized by the tetrad of hyperthermia, extreme muscle rigidity, autonomic dysregulation, and altered mental status with profound CK elevation."
  },
  {
    id: 16,
    specialty: "Dermatology",
    title: "Question 16 (Dermatology)",
    scenario: "A 32-year-old man presents with target-like concentric lesions on the palms of his hands and soles of his feet. He reports an outbreak of painful cold sores around his lips approximately 10 days ago. The mucosal membranes are completely spared, and he has no systemic symptoms.",
    prompt: "What is the most likely diagnosis?",
    options: [
      { key: "A", text: "Erythema multiforme minor" },
      { key: "B", text: "Stevens-Johnson syndrome (SJS)" },
      { key: "C", text: "Toxic epidermal necrolysis (TEN)" },
      { key: "D", text: "Secondary syphilis" },
      { key: "E", text: "Bullous pemphigoid" }
    ],
    correctAnswer: "A",
    explanation: "Erythema multiforme (EM) minor features classic target lesions (central zone of epidermal necrosis/vesicle surrounded by concentric erythema) on acral surfaces, commonly precipitated by Herpes Simplex Virus (HSV) infections, without significant mucosal involvement."
  },
  {
    id: 17,
    specialty: "Cardiology / Arrhythmia",
    title: "Question 17 (Cardiology / Arrhythmia)",
    scenario: "A 74-year-old woman presents to the emergency room with palpitations, dizziness, and shortness of breath. Her blood pressure is 74/46 mmHg, heart rate is 165 bpm, and oxygen saturation is 90% on room air. The monitor reveals an irregularly irregular narrow-complex tachycardia without distinct P waves.",
    prompt: "What is the most appropriate next step in management?",
    options: [
      { key: "A", text: "Intravenous amiodarone infusion" },
      { key: "B", text: "Intravenous metoprolol bolus" },
      { key: "C", text: "Intravenous digoxin" },
      { key: "D", text: "Synchronized direct-current (DC) cardioversion" },
      { key: "E", text: "Unsynchronized defibrillation" }
    ],
    correctAnswer: "D",
    explanation: "The patient has atrial fibrillation with rapid ventricular response presenting with hemodynamic instability (hypotension, altered perfusion, dyspnea). Unstable tachyarrhythmias require immediate synchronized DC cardioversion."
  },
  {
    id: 18,
    specialty: "Endocrinology",
    title: "Question 18 (Endocrinology)",
    scenario: "A 38-year-old woman presents with persistent fatigue, weight loss, lightheadedness, and salt cravings. Examination shows hyperpigmentation over the palmar creases and buccal mucosa. Blood pressure is 88/56 mmHg. Serum labs: Sodium 129 mmol/L, Potassium 5.6 mmol/L, Glucose 3.8 mmol/L.",
    prompt: "What is the most definitive diagnostic test to establish the diagnosis?",
    options: [
      { key: "A", text: "Random morning serum cortisol" },
      { key: "B", text: "Short Synacthen (ACTH stimulation) test" },
      { key: "C", text: "24-hour urinary free cortisol" },
      { key: "D", text: "Low-dose dexamethasone suppression test" },
      { key: "E", text: "Oral glucose tolerance test" }
    ],
    correctAnswer: "B",
    explanation: "The symptoms, hypotension, hyperpigmentation, hyponatremia, and hyperkalemia indicate primary adrenal insufficiency (Addison's disease). The gold-standard confirmatory test is the Short Synacthen (cosyntropin) stimulation test, demonstrating an inadequate rise in serum cortisol following ACTH administration."
  },
  {
    id: 19,
    specialty: "Pediatrics",
    title: "Question 19 (Pediatrics)",
    scenario: "An 8-month-old infant presents with sudden, paroxysmal episodes of inconsolable crying during which he draws his knees to his chest. Between episodes, he appears lethargic. Two hours into admission, he passes a stool described as resembling \"red currant jelly.\"",
    prompt: "What is the initial diagnostic and therapeutic intervention of choice?",
    options: [
      { key: "A", text: "Urgent exploratory laparotomy" },
      { key: "B", text: "Ultrasound-guided air/contrast enema reduction" },
      { key: "C", text: "Upper GI series with small bowel follow-through" },
      { key: "D", text: "Colonoscopy" },
      { key: "E", text: "Empirical broad-spectrum IV antibiotics alone" }
    ],
    correctAnswer: "B",
    explanation: "This is the classical presentation of intussusception (colicky pain, red currant jelly stool, lethargy). An air or contrast enema serves as both the definitive diagnostic method and the initial therapeutic procedure in stable patients without peritonitis or perforation."
  },
  {
    id: 20,
    specialty: "Pulmonology / Critical Care",
    title: "Question 20 (Pulmonology / Critical Care)",
    scenario: "A 24-year-old man with brittle asthma presents with severe breathlessness. Despite continuous nebulized salbutamol and ipratropium bromide, he becomes increasingly somnolent and is unable to complete a sentence. Auscultation reveals a \"silent chest.\" Arterial blood gas (ABG) on 15 L/min non-rebreather mask shows: pH 7.34, PaO₂ 8.5 kPa (64 mmHg), PaCO₂ 5.6 kPa (42 mmHg), HCO₃⁻ 24 mmol/L.",
    prompt: "What is the most alarming feature indicating life-threatening exhaustion in this patient?",
    options: [
      { key: "A", text: "The presence of a low PaO₂" },
      { key: "B", text: "The normal PaCO₂ level" },
      { key: "C", text: "The normal HCO₃⁻ level" },
      { key: "D", text: "The slightly acidemic pH" },
      { key: "E", text: "Tachycardia" }
    ],
    correctAnswer: "B",
    explanation: "During an acute severe asthma exacerbation, hyperventilation typically drives PaCO₂ down (respiratory alkalosis). A \"normal\" or pseudonormalized PaCO₂ (40–42 mmHg) in a severely dyspneic, exhausted asthmatic indicates respiratory muscle fatigue, failing ventilation, and impending respiratory arrest, mandating urgent ICU consultation and preparation for mechanical ventilation."
  }
];
