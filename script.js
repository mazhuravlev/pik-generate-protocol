let taskLoaded = false;

function TaskFormatException(message) {
    this.message = message;
    if ("captureStackTrace" in Error) {
        Error.captureStackTrace(this, TaskFormatException);
    }
    else {
        this.stack = (new Error()).stack;
    }
}
TaskFormatException.prototype = Object.create(Error.prototype);

function WorkflowException(message) {
    this.message = message;
    if ("captureStackTrace" in Error) {
        Error.captureStackTrace(this, WorkflowException);
    }
    else {
        this.stack = (new Error()).stack;
    }
}
WorkflowException.prototype = Object.create(Error.prototype);

function generate(content) {
    let task = JSON.parse($("#task-json").text());
    if (!task.notes) {
        throw new TaskFormatException("Нужно внести номер протокола в описание (description) задачи");
    }
    const subtasks = JSON.parse($("#subtasks-json").text()).map(x => x.name.trim());
    if (subtasks.length === 0) {
        throw new TaskFormatException("Список подзадач пуст. Внесите подзадачи или выберите другую задачу.");
    }
    const nameMatches = /^(\d{2})\.(\d{2})\.(\d{4}) \d{2}:\d{2}\s+(.+)/.exec(task.name);
    if (nameMatches === null) {
        throw new TaskFormatException("Неверный формат имени задачи");
    }

    let signs = getSigns(val("#chairman"), val("#secretary"), val("#participants"));
    let noteData = getNoteData(task.notes);


    let questions = getQuestions(subtasks);
    let answers = getAnswers(subtasks);
    if (questions.length !== answers.length) {
        throw new TaskFormatException("Не совпадает количество вопросов и ответов");
    }

    if(!content) {
        if(content = localStorage.getItem("zipTemplate")) {
            // use last template
        } else {
            console.log("Формат задачи ОК. Теперь выберите файл шаблона и нажмите генерировать.");
            return;
        }
    } else {
        localStorage.setItem("zipTemplate", content);
    }
    const zip = new JSZip(content);
    const doc = new Docxtemplater().loadZip(zip);
    doc.setData({
        protocol_number: val("#protocol-number"),
        topic: nameMatches[4],
        chairman: val("#chairman"),
        secretary: val("#secretary"),
        participants: val("#participants"),
        questions: questions,
        answers: answers,
        day: nameMatches[1],
        month: nameMatches[2],
        year: nameMatches[3],
        signs: signs
    });

    doc.render();

    const out = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    saveAs(out, `Протокол ${task.notes}.docx`);
}

function getNoteData(notes) {
    let result = {};
    try {
        notes.split("\n").map(x => x.split(":")).forEach(x => {
            if (x.length == 2) {
                result[x[0].trim()] = x[1].trim();
            }
        });
    } catch (e) {
        throw new TaskFormatException("Неверный формат описания: " + e.message);
    }
    return result;
}

function val(selector) {
    return $(selector).val();
}

function getAnswers(subtasks) {
    const index = subtasks.indexOf("Решения:");
    if (index === -1) {
        throw new TaskFormatException("Должна присутствовать строка 'Решения:'");
    }
    const answers = [];
    const answerData = subtasks.slice(index + 1);
    for (let i = 0; i < answerData.length; i++) {
        if (/^По.+(задаче|вопросу):$/.exec(answerData[i])) {
            answers.push({
                title: answerData[i],
                subanswers: []
            });
        } else {
            if (answers.length === 0) {
                throw new TaskFormatException("Первой строкой в блоке Решения должна быть 'По [такой-то] (задаче|вопросу):'");
            }
            answers[answers.length - 1].subanswers.push({
                text: answerData[i]
            });
        }
    }
    return answers;
}

function getQuestions(subtasks) {
    if (subtasks[0] !== "Вопросы:") {
        throw new TaskFormatException("Первая строка должна быть 'Вопросы:'");
    }
    const questions = [];
    for (let i = 1; i < subtasks.length; i++) {
        if (subtasks[i] === "Решения:") {
            return questions;
        } else {
            questions.push({
                text: subtasks[i]
            });
        }
    }
    throw new TaskFormatException("Должна присутствовать строка 'Решения:'");
}

function onSubmit() {
    if (!taskLoaded) {
        throw new WorkflowException("Нужно загрузить задачу из Asana");
    }

    if (getFile()) {
        const reader = new FileReader();

        reader.onloadend = function () {
            generate(reader.result);
        };
        reader.readAsBinaryString(getFile());
    } else {
        generate(null);
    }
}

function getFile() {
    return file = $("#file-input").get(0).files[0];
}

function loadTask() {
    let apikey = $("#apikey").val();
    if (!apikey) {
        throw new WorkflowException("Нужно ввести API ключ");
    }
    taskLoaded = false;
    let taskMatches = /(\d+)$/.exec($("#task_url").val());
    if (!taskMatches) {
        throw new WorkflowException("Нужно указать валидный URL задачи");
    }
    let loadButton = $("#load_task");
    loadButton.removeClass("btn-primary").removeClass("btn-success");
    const client = Asana.Client.create().useAccessToken(apikey);
    client.tasks.findById(taskMatches[1]).then(x => {
        $("#task-json").text(JSON.stringify(x));
        setProtocolPeople(getNoteData(x.notes));
        client.tasks.subtasks(taskMatches[1]).then(x => {
            $("#subtasks-json").text(JSON.stringify(x["data"]));
            taskLoaded = true;
            loadButton.removeClass("btn-danger").addClass("btn-success");
            $("form").submit();
            localStorage.setItem("apikey", apikey);
        }, e => apiError(e.message, loadButton));
    }, e => apiError(e.message, loadButton));
}

function apiError(message, button) {
    button.addClass("btn-danger");
    alert("Ошибка API Asana: " + message);
}

function setProtocolPeople(noteData) {
    if ("Номер" in noteData) {
        $("#protocol-number").val(noteData["Номер"])
    }
    if ("Председатель" in noteData) {
        $("#chairman").val(noteData["Председатель"])
    }
    if ("Секретарь" in noteData) {
        $("#secretary").val(noteData["Секретарь"])
    }
    if ("Присутствовали" in noteData) {
        $("#participants").val(noteData["Присутствовали"])
    }
}

function getSigns(c, s, p) {
    const fioRegex = /(^[\wа-яА-Яё]*\s+[\wа-яА-Яё]\.([\wа-яА-Яё]\.)?)/u;
    let cMatches = fioRegex.exec(c.trim());
    if (!cMatches) {
        throw new WorkflowException("ФИО председателя невалидно, должно быть Фамилия И.[О.]");
    }
    const names = [cMatches[1]];
    let sMatches = fioRegex.exec(s.trim());
    if (!sMatches) {
        throw new WorkflowException("ФИО секретаря невалидно, должно быть Фамилия И.[О.]");
    }
    if (names.indexOf(sMatches[1]) === -1) {
        names.push(sMatches[1]);
    }
    if (!p.trim() || p.split(",").length === 0) {
        throw new WorkflowException("Заполните имена участников, разделенные запятой");
    }
    p.split(",").map(x => x.trim()).forEach(x => {
        if (names.indexOf(x) === -1) {
            names.push(x);
        }
    });
    const maxLength = names.reduce((a, c) => {
        return c.length > a ? c.length : a;
    }, 0);
    return names.map(x => {
        return {
            name: x,
            pad: getPad(maxLength - x.length, "_")
        };
    });
}

function getPad(len, ch) {
    let pad = "";
    for (let i = 0; i < len; i++) {
        pad += ch;
    }
    return pad;
}

function detectIE() {
    let ua = window.navigator.userAgent;
    let msie = ua.indexOf('MSIE ');
    if (msie > 0) {
        return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
    }
    let trident = ua.indexOf('Trident/');
    if (trident > 0) {
        let rv = ua.indexOf('rv:');
        return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
    }
    let edge = ua.indexOf('Edge/');
    if (edge > 0) {
        return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
    }
    return false;
}

$(() => {
    $("#apikey").val(localStorage.getItem("apikey"));

    if(localStorage.getItem("zipTemplate")) {
        $('#has-saved-template').show();
    }
    if(!detectIE()) { $('#is-ie').hide(); }

    $("#json-fiedls-buton").click((e) => {
        if (!taskLoaded) {
            e.stopPropagation();
            alert("Нужно загрузить задачу из Asana");
        }
    });

    Zone.current.fork({
        onHandleError: function (parentZoneDelegate, currentZone, targetZone, e) {
            if (e instanceof TaskFormatException) {
                alert(`Ошибка в формате задачи Asana: ${e.message}`);
            } else if (e instanceof WorkflowException) {
                alert(`Ошибка: ${e.message}`);
            } else {
                alert(`Неожданая ошибка, подробности в консоли: ${e.message}`);
                throw e;
            }
        }
    }).run(() => {
        $("button#load_task").click(loadTask);
        $("form").submit((e) => {
            e.preventDefault();
            onSubmit();
        });
    });
});