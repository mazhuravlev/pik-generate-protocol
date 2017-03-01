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

    let noteData = getNoteData(task.notes);

    const zip = new JSZip(content);
    const doc = new Docxtemplater().loadZip(zip);
    let questions = getQuestions(subtasks);
    let answers = getAnswers(subtasks);
    if (questions.length !== answers.length) {
        throw new TaskFormatException("Не совпадает количество вопросов и ответов");
    }
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
        signs: getSigns(val("#chairman"), val("#secretary"), val("#participants"))
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
        if (/^По.+задаче:$/.exec(answerData[i])) {
            answers.push({
                title: answerData[i],
                subanswers: []
            });
        } else {
            if (answers.length === 0) {
                throw new TaskFormatException("Первой строкой в блоке Решения должна быть 'По [такой-то] задаче:'");
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
    let file = $("#file-input").get(0).files[0];
    if (!file) {
        throw new WorkflowException("Нужно выбрать файл шаблона протокола");
    }
    const reader = new FileReader();

    reader.onloadend = function () {
        generate(reader.result);
    };
    reader.readAsBinaryString(file);
}

function loadTask() {
    let apikey = "0/cc880fedbaec6446c336f3178bbce1bf"; //$("#apikey").val();
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
            loadButton.addClass("btn-success");
            localStorage.setItem("apikey", apikey);
        }, e => apiError(e.message, loadButton));
    }, e => apiError(e.message, loadButton));
}

function apiError(message, button) {
    button.addClass("btn-danger");
    throw new WorkflowException("Ошибка API Asana: " + message);
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
    const fioRegex = /(^[\wа-яА-Я]*\s+[\wа-яА-Я]\.[\wа-яА-Я]\.)/u;
    let cMatches = fioRegex.exec(c.trim());
    if (!cMatches) {
        throw new WorkflowException("ФИО председателя невалидно, должно быть Фамилия И.О.");
    }
    const names = [cMatches[1]];
    let sMatches = fioRegex.exec(s.trim());
    if (!sMatches) {
        throw new WorkflowException("ФИО секретаря невалидно, должно быть Фамилия И.О.");
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

$(() => {
    // $("#apikey").val(localStorage.getItem("apikey"));

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