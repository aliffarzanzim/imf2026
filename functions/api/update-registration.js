// functions/api/update-registration.js
import { sendEmail, buildUpdateConfirmationEmail } from "./_email.js";
import { verifyDelegateToken } from "./_delegateAuth.js";

function normalizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/[^0-9]/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "Database binding (DB) is missing. Please configure D1." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure reg_number column exists in abstracts
    try {
      await env.DB.prepare("ALTER TABLE abstracts ADD COLUMN reg_number TEXT").run();
    } catch (_) {
      // Column already exists
    }

    const body = await request.json();
    const { regNumber, email, phone, sessionToken, registration: regUpdates, abstracts: absList, abstract: absUpdates } = body;

    const identifierReg = (regNumber && String(regNumber).trim().toUpperCase()) || "";
    const identifierEmail = (email && String(email).trim().toLowerCase()) || "";

    if (!identifierReg && !identifierEmail) {
      return new Response(
        JSON.stringify({ error: "Registration Number or Email is required for update." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 🛡️ Security: Verify cryptographic session token issued upon OTP verification
    const authHeader = request.headers.get("Authorization");
    let tokenToVerify = sessionToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      tokenToVerify = authHeader.slice(7).trim();
    }

    const sessionSecret = env.EMAIL_SECRET || env.ADMIN_PASSWORD || "imf2026_delegate_session_secret";
    const verifiedSession = await verifyDelegateToken(tokenToVerify, sessionSecret);

    if (!verifiedSession) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized: Missing, invalid, or expired session token. Please verify with your email again to update your registration.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if abstract submission & delegate editing is turned off by admin
    try {
      const absConfig = await env.DB.prepare(
        "SELECT value FROM system_config WHERE key = 'abstract_edit_open' LIMIT 1"
      ).first();
      if (absConfig && absConfig.value === "false") {
        return new Response(
          JSON.stringify({
            error: "Abstract submission and registration editing are currently closed by the organizing committee (View-Only Mode).",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch (_) {}

    // Authenticate delegate record
    let reg = null;
    if (identifierReg) {
      reg = await env.DB.prepare(
        "SELECT * FROM registrations WHERE UPPER(TRIM(reg_number)) = ? LIMIT 1"
      ).bind(identifierReg).first();
    } else {
      reg = await env.DB.prepare(
        "SELECT * FROM registrations WHERE LOWER(TRIM(email)) = ? ORDER BY id DESC LIMIT 1"
      ).bind(identifierEmail).first();
    }

    if (!reg) {
      return new Response(
        JSON.stringify({ error: "Registration record not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 🛡️ Security: Enforce that the token belongs strictly to this record
    if (
      verifiedSession.regNumber.toUpperCase() !== reg.reg_number.toUpperCase() ||
      verifiedSession.email.toLowerCase() !== reg.email.trim().toLowerCase()
    ) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Session token does not match this registration record." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch pre-existing abstracts to compute exact changes
    const preExistingAbsRows = await env.DB.prepare(
      "SELECT * FROM abstracts WHERE reg_number = ? OR LOWER(TRIM(email)) = ? ORDER BY id ASC"
    ).bind(reg.reg_number, reg.email.trim().toLowerCase()).all();
    const preExistingAbstracts = preExistingAbsRows?.results || [];
    const changes = [];

    // 1. Update Registration if regUpdates provided (Email is strictly read-only)
    let updatedFullName = reg.full_name;
    let updatedInstitution = reg.institution;
    let updatedBatch = reg.batch;
    let updatedYear = reg.academic_year;
    let updatedPhone = reg.phone;
    const updatedEmail = reg.email; // Email is not editable

    if (regUpdates) {
      const newFullName = regUpdates.fullName && regUpdates.fullName.trim();
      const oldFullName = (reg.full_name || "").trim();
      if (newFullName && newFullName !== oldFullName) {
        changes.push({
          label: "Full Name",
          before: oldFullName,
          after: newFullName,
        });
        updatedFullName = newFullName;
      }

      const newInstitution = regUpdates.institution && regUpdates.institution.trim();
      const oldInstitution = (reg.institution || "").trim();
      if (newInstitution && newInstitution !== oldInstitution) {
        changes.push({
          label: "Medical College / Institution",
          before: oldInstitution,
          after: newInstitution,
        });
        updatedInstitution = newInstitution;
      }

      const newBatch = regUpdates.batch && regUpdates.batch.trim();
      const oldBatch = (reg.batch || "").trim();
      if (newBatch && newBatch !== oldBatch) {
        changes.push({
          label: "Batch",
          before: oldBatch,
          after: newBatch,
        });
        updatedBatch = newBatch;
      }

      const newYear = regUpdates.academicYear && regUpdates.academicYear.trim();
      const oldYear = (reg.academic_year || "").trim();
      if (newYear && newYear !== oldYear) {
        changes.push({
          label: "Academic Year",
          before: oldYear,
          after: newYear,
        });
        updatedYear = newYear;
      }

      const newPhone = regUpdates.phone && regUpdates.phone.trim();
      const oldPhone = (reg.phone || "").trim();
      if (newPhone && newPhone !== oldPhone) {
        changes.push({
          label: "Contact Phone Number",
          before: oldPhone,
          after: newPhone,
        });
        updatedPhone = newPhone;
      }

      // Check Activities differences
      if (regUpdates.activities !== undefined) {
        let oldActivities = [];
        try {
          oldActivities = JSON.parse(reg.activities || "[]");
          if (!Array.isArray(oldActivities)) oldActivities = reg.activities ? [String(reg.activities)] : [];
        } catch (_) {
          oldActivities = reg.activities ? [String(reg.activities)] : [];
        }
        const newActivities = Array.isArray(regUpdates.activities) ? regUpdates.activities : [];

        const oldSet = new Set(oldActivities);
        const newSet = new Set(newActivities);
        const addedActivities = newActivities.filter((x) => !oldSet.has(x));
        const removedActivities = oldActivities.filter((x) => !newSet.has(x));

        if (addedActivities.length > 0 || removedActivities.length > 0) {
          const details = [];
          if (addedActivities.length > 0) details.push(`Added: ${addedActivities.join(", ")}`);
          if (removedActivities.length > 0) details.push(`Removed: ${removedActivities.join(", ")}`);
          changes.push({
            label: "Registered Events & Activities",
            details,
          });
        }
      }

      // Check Competition Categories differences
      if (regUpdates.competitionCategory !== undefined) {
        const oldCats = (reg.competition_category || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        const incomingCats = Array.isArray(regUpdates.competitionCategory)
          ? regUpdates.competitionCategory.map((c) => String(c).trim()).filter(Boolean)
          : String(regUpdates.competitionCategory || "").split(",").map((c) => c.trim()).filter(Boolean);

        const oldCatsSorted = [...oldCats].sort();
        const newCatsSorted = [...incomingCats].sort();

        if (JSON.stringify(oldCatsSorted) !== JSON.stringify(newCatsSorted)) {
          const addedCats = incomingCats.filter((c) => !oldCats.includes(c));
          const removedCats = oldCats.filter((c) => !incomingCats.includes(c));
          const details = [];
          if (addedCats.length > 0) details.push(`Added: ${addedCats.join(", ")}`);
          if (removedCats.length > 0) details.push(`Removed: ${removedCats.join(", ")}`);
          if (details.length === 0 && incomingCats.length > 0) {
            details.push(`Selected: ${incomingCats.join(", ")}`);
          }
          changes.push({
            label: "Competition Categories",
            details: details.length > 0 ? details : [`Updated to: ${incomingCats.join(", ") || "(None)"}`],
          });
        }
      }

      // Prior Experience differences
      if (regUpdates.priorExperience !== undefined) {
        const oldExp = (reg.prior_experience || "").trim();
        const newExp = (regUpdates.priorExperience || "").trim();
        if (oldExp !== newExp) {
          changes.push({
            label: "Prior Competition/Conference Experience",
            before: oldExp || "(None)",
            after: newExp || "(None)",
          });
        }
      }

      // Questions or Special Requirements
      if (regUpdates.queries !== undefined) {
        const oldQueries = (reg.queries || "").trim();
        const newQueries = (regUpdates.queries || "").trim();
        if (oldQueries !== newQueries) {
          changes.push({
            label: "Questions or Special Requirements",
            before: oldQueries || "(None)",
            after: newQueries || "(None)",
          });
        }
      }

      await env.DB.prepare(`
        UPDATE registrations
        SET full_name = ?, institution = ?, batch = ?, academic_year = ?,
            phone = ?, activities = ?, competition_category = ?,
            prior_experience = ?, queries = ?
        WHERE id = ?
      `).bind(
        updatedFullName,
        updatedInstitution,
        updatedBatch,
        updatedYear,
        updatedPhone,
        JSON.stringify(regUpdates.activities || []),
        Array.isArray(regUpdates.competitionCategory)
          ? regUpdates.competitionCategory.join(", ")
          : (regUpdates.competitionCategory ? String(regUpdates.competitionCategory).trim() : null),
        regUpdates.priorExperience ? String(regUpdates.priorExperience).trim() : null,
        regUpdates.queries ? String(regUpdates.queries).trim() : null,
        reg.id
      ).run();
    }

    // 2. Abstract submission or update (supports array of abstracts or single abstract)
    const abstractNumbers = [];
    let primaryAbstractNumber = null;

    const abstractsToProcess = Array.isArray(absList)
      ? absList
      : (absUpdates && (absUpdates.title || absUpdates.abstractBody) ? [absUpdates] : []);

    if (abstractsToProcess.length > 0) {
      for (const item of abstractsToProcess) {
        if (!item.title || !item.title.trim()) continue;

        let existingAbs = null;
        if (item.id && !isNaN(Number(item.id))) {
          existingAbs = preExistingAbstracts.find((a) => String(a.id) === String(item.id));
        }
        if (!existingAbs && item.abstractNumber) {
          existingAbs = preExistingAbstracts.find((a) => a.abstract_number === String(item.abstractNumber).trim());
        }
        if (!existingAbs && preExistingAbstracts.length === 1 && abstractsToProcess.length === 1) {
          existingAbs = preExistingAbstracts[0];
        }

        if (existingAbs) {
          // Update existing abstract
          const currentAbsNum = existingAbs.abstract_number;
          abstractNumbers.push(currentAbsNum);
          if (!primaryAbstractNumber) primaryAbstractNumber = currentAbsNum;

          const newFileKey = item.r2FileKey || existingAbs.r2_file_key;
          const newFileName = item.fileName || existingAbs.file_name;
          const newFileSize = item.fileSize !== undefined ? Number(item.fileSize) : existingAbs.file_size;

          // Track changes on this abstract
          const absDetails = [];
          const oldTitle = (existingAbs.title || "").trim();
          const newTitle = item.title.trim();
          if (newTitle && oldTitle !== newTitle) {
            absDetails.push(`Title: "${oldTitle}" → "${newTitle}"`);
          }

          const oldSub = (existingAbs.submission_type || "").trim();
          const newSub = (item.submissionType && item.submissionType.trim()) || oldSub;
          if (newSub && oldSub !== newSub) {
            absDetails.push(`Submission Type: "${oldSub}" → "${newSub}"`);
          }

          const oldCat = (existingAbs.presentation_category || "").trim();
          const newCat = (item.presentationCategory && item.presentationCategory.trim()) || oldCat;
          if (newCat && oldCat !== newCat) {
            absDetails.push(`Presentation Category: "${oldCat}" → "${newCat}"`);
          }

          const oldPresenter = (existingAbs.presenter_name || "").trim();
          const newPresenter = (item.presenterName && item.presenterName.trim()) || oldPresenter;
          if (newPresenter && oldPresenter !== newPresenter) {
            absDetails.push(`Presenter: "${oldPresenter}" → "${newPresenter}"`);
          }

          const oldCo = (existingAbs.co_authors || "").trim();
          const newCo = item.coAuthors !== undefined ? String(item.coAuthors).trim() : oldCo;
          if (oldCo !== newCo) {
            absDetails.push(`Co-Authors: "${oldCo || "(None)"}" → "${newCo || "(None)"}"`);
          }

          const oldAff = (existingAbs.author_affiliation || "").trim();
          const newAff = item.authorAffiliation !== undefined ? String(item.authorAffiliation).trim() : oldAff;
          if (oldAff !== newAff) {
            absDetails.push(`Author Affiliation: "${oldAff || "(None)"}" → "${newAff || "(None)"}"`);
          }

          const oldSup = (existingAbs.supervisor_name || "").trim();
          const newSup = item.supervisorName !== undefined ? String(item.supervisorName).trim() : oldSup;
          if (oldSup !== newSup) {
            absDetails.push(`Supervisor Name: "${oldSup || "(None)"}" → "${newSup || "(None)"}"`);
          }

          const oldKw = (existingAbs.keywords || "").trim();
          const newKw = item.keywords !== undefined ? String(item.keywords).trim() : oldKw;
          if (oldKw !== newKw) {
            absDetails.push(`Keywords: "${oldKw || "(None)"}" → "${newKw || "(None)"}"`);
          }

          const oldBody = (existingAbs.abstract_body || "").trim();
          const newBody = item.abstractBody !== undefined ? String(item.abstractBody).trim() : oldBody;
          if (oldBody !== newBody) {
            const wordCount = newBody.split(/\s+/).filter(Boolean).length;
            absDetails.push(`Abstract Body / Paragraph updated (${wordCount} words)`);
          }

          const oldFile = (existingAbs.file_name || "").trim();
          const newFileClean = (newFileName || "").trim();
          const oldKey = (existingAbs.r2_file_key || "").trim();
          const newKeyClean = (newFileKey || "").trim();
          if ((newKeyClean && newKeyClean !== oldKey) || (newFileClean && newFileClean !== oldFile)) {
            absDetails.push(`Uploaded Document: "${oldFile || "None"}" → "${newFileClean}"`);
          }

          if (absDetails.length > 0) {
            changes.push({
              label: `Updated Abstract [${currentAbsNum || "Draft"}]`,
              details: absDetails,
            });
          }

          await env.DB.prepare(`
            UPDATE abstracts
            SET reg_number = ?,
                full_name = ?,
                institution = ?,
                batch = ?,
                academic_year = ?,
                phone = ?,
                email = ?,
                title = ?,
                submission_type = ?,
                presentation_category = ?,
                abstract_body = ?,
                keywords = ?,
                presenter_name = ?,
                co_authors = ?,
                author_affiliation = ?,
                supervisor_name = ?,
                r2_file_key = ?,
                file_name = ?,
                file_size = ?
            WHERE id = ?
          `).bind(
            reg.reg_number,
            updatedFullName,
            updatedInstitution,
            updatedBatch,
            updatedYear,
            updatedPhone,
            updatedEmail,
            item.title.trim(),
            (item.submissionType && item.submissionType.trim()) || existingAbs.submission_type,
            (item.presentationCategory && item.presentationCategory.trim()) || existingAbs.presentation_category,
            (item.abstractBody && item.abstractBody.trim()) || existingAbs.abstract_body,
            item.keywords ? String(item.keywords).trim() : existingAbs.keywords,
            (item.presenterName && item.presenterName.trim()) || existingAbs.presenter_name,
            item.coAuthors ? String(item.coAuthors).trim() : existingAbs.co_authors,
            item.authorAffiliation !== undefined ? String(item.authorAffiliation).trim() : existingAbs.author_affiliation,
            item.supervisorName ? String(item.supervisorName).trim() : existingAbs.supervisor_name,
            newFileKey,
            newFileName,
            newFileSize,
            existingAbs.id
          ).run();
        } else {
          // Insert new abstract
          const maxAbsRow = await env.DB.prepare("SELECT MAX(id) as maxId FROM abstracts").first();
          const nextAbsSeq = ((maxAbsRow && maxAbsRow.maxId) || 0) + 1;
          const newAbsNum = `IMF-ABS-${String(nextAbsSeq).padStart(4, "0")}`;
          abstractNumbers.push(newAbsNum);
          if (!primaryAbstractNumber) primaryAbstractNumber = newAbsNum;

          changes.push({
            label: `Added New Abstract [${newAbsNum}]`,
            details: [
              `Title: "${item.title.trim()}"`,
              `Submission Type: ${(item.submissionType && item.submissionType.trim()) || "Original Article"}`,
              `Presentation Category: ${(item.presentationCategory && item.presentationCategory.trim()) || "Academic Topic Presentation"}`,
              `Presenter: ${(item.presenterName && item.presenterName.trim()) || updatedFullName}`,
              item.fileName ? `Uploaded Document: ${item.fileName.trim()}` : null,
            ].filter(Boolean),
          });

          await env.DB.prepare(`
            INSERT INTO abstracts (
              abstract_number, reg_number, full_name, institution, batch, academic_year,
              phone, email, title, submission_type, presentation_category,
              abstract_body, keywords, presenter_name, co_authors,
              author_affiliation, supervisor_name, r2_file_key, file_name, file_size
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            newAbsNum,
            reg.reg_number,
            updatedFullName,
            updatedInstitution,
            updatedBatch,
            updatedYear,
            updatedPhone,
            updatedEmail,
            item.title.trim(),
            (item.submissionType && item.submissionType.trim()) || "Original Article",
            (item.presentationCategory && item.presentationCategory.trim()) || "Academic Topic Presentation",
            (item.abstractBody && item.abstractBody.trim()) || "",
            item.keywords ? String(item.keywords).trim() : null,
            (item.presenterName && item.presenterName.trim()) || updatedFullName,
            item.coAuthors ? String(item.coAuthors).trim() : null,
            item.authorAffiliation ? String(item.authorAffiliation).trim() : null,
            item.supervisorName ? String(item.supervisorName).trim() : null,
            item.r2FileKey ? item.r2FileKey.trim() : "pending",
            item.fileName ? item.fileName.trim() : "abstract.pdf",
            Number(item.fileSize) || 0
          ).run();
        }
      }
    }

    // Handle deletion of removed abstracts
    const { deletedAbstractIds } = body;
    if (Array.isArray(deletedAbstractIds) && deletedAbstractIds.length > 0) {
      for (const delId of deletedAbstractIds) {
        if (delId) {
          const deletedAbs = preExistingAbstracts.find(
            (a) => a.id === delId || a.id === Number(delId)
          );
          if (deletedAbs) {
            changes.push({
              label: `Removed Abstract [${deletedAbs.abstract_number || "Draft"}]`,
              details: [
                `Title: "${deletedAbs.title || "Untitled"}"`,
                deletedAbs.presentation_category ? `Category: ${deletedAbs.presentation_category}` : null,
                deletedAbs.file_name ? `Attached File: ${deletedAbs.file_name}` : null,
              ].filter(Boolean),
            });
          } else {
            changes.push({
              label: `Removed Abstract (ID: ${delId})`,
              description: "Abstract was removed from registration.",
            });
          }

          try {
            await env.DB.prepare(
              "DELETE FROM abstracts WHERE id = ? AND reg_number = ?"
            ).bind(delId, reg.reg_number).run();
          } catch (_) {}
        }
      }
    }

    // Check current count of abstracts for this delegate
    const remainingAbsCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM abstracts WHERE reg_number = ? OR LOWER(TRIM(email)) = ?"
    ).bind(reg.reg_number, updatedEmail.trim().toLowerCase()).first();
    const hasRemainingAbstracts = (remainingAbsCountRow?.cnt || 0) > 0;

    // Fetch refreshed records to return to client
    const updatedReg = await env.DB.prepare(
      "SELECT * FROM registrations WHERE id = ?"
    ).bind(reg.id).first();

    const updatedAbsRows = await env.DB.prepare(
      "SELECT * FROM abstracts WHERE reg_number = ? OR LOWER(TRIM(email)) = ? ORDER BY id ASC"
    ).bind(reg.reg_number, updatedEmail.trim().toLowerCase()).all();

    let refreshedActivities = [];
    try {
      refreshedActivities = JSON.parse(updatedReg.activities || "[]");
    } catch (_) {
      refreshedActivities = updatedReg.activities ? [updatedReg.activities] : [];
    }

    const formattedAbstracts = (updatedAbsRows?.results || []).map((a) => ({
      id: a.id,
      abstractNumber: a.abstract_number,
      regNumber: a.reg_number,
      title: a.title,
      submissionType: a.submission_type,
      presentationCategory: a.presentation_category,
      abstractBody: a.abstract_body,
      keywords: a.keywords || "",
      presenterName: a.presenter_name || "",
      coAuthors: a.co_authors || "",
      authorAffiliation: a.author_affiliation || "",
      supervisorName: a.supervisor_name || "",
      fileName: a.file_name,
      fileSize: a.file_size,
      r2FileKey: a.r2_file_key,
      presentationFileName: a.presentation_file_name,
      presentationFileSize: a.presentation_file_size,
      presentationFileKey: a.presentation_file_key,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));

    const refreshedRegistration = {
      regNumber: updatedReg.reg_number,
      fullName: updatedReg.full_name,
      institution: updatedReg.institution,
      batch: updatedReg.batch,
      academicYear: updatedReg.academic_year,
      phone: updatedReg.phone,
      email: updatedReg.email,
      activities: refreshedActivities,
      competitionCategory: updatedReg.competition_category ? updatedReg.competition_category.split(", ").filter(Boolean) : [],
      priorExperience: updatedReg.prior_experience || "",
      queries: updatedReg.queries || "",
      hasAbstract: hasRemainingAbstracts,
      createdAt: updatedReg.created_at,
      updatedAt: updatedReg.updated_at,
    };

    // Send confirmation email (non-blocking) with exact changes
    try {
      const emailPromise = sendEmail({
        env,
        to: updatedEmail.trim().toLowerCase(),
        subject: `IMF 2026 Registration Details Updated [${reg.reg_number}]`,
        html: buildUpdateConfirmationEmail({
          fullName: updatedFullName,
          regNumber: reg.reg_number,
          abstractNumber: primaryAbstractNumber || (abstractNumbers.length > 0 ? abstractNumbers.join(", ") : null),
          isAbstractUpdate: abstractNumbers.length > 0 || Boolean(absUpdates) || Boolean(deletedAbstractIds?.length),
          changes,
        }),
      });

      if (context.waitUntil && typeof context.waitUntil === "function") {
        context.waitUntil(emailPromise);
      } else {
        emailPromise.catch((e) => console.error("[Update Email Error]", e));
      }
    } catch (emailErr) {
      console.error("[Update Email Dispatch Error]", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        regNumber: reg.reg_number,
        abstractNumber: primaryAbstractNumber || (abstractNumbers.length > 0 ? abstractNumbers.join(", ") : null),
        abstractNumbers,
        registration: refreshedRegistration,
        abstracts: formattedAbstracts,
        abstract: formattedAbstracts[0] || null,
        changes,
        message: "Your registration details and abstracts have been successfully updated.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to update registration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
