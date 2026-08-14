const eventsService = require("./events.service");

const getEvents = async (req, res) => {
  try {
    const { search = "", sort = "order_no", order = "ASC", page = 1, limit = 10, status = "" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const data = await eventsService.getEvents(search, sort, order, Number(limit), offset, status);
    
    return res.status(200).json({
      success: true,
      data: data.rows,
      total: data.total
    });
  } catch (error) {
    console.error("Get Events Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getEventById = async (req, res) => {
  try {
    const event = await eventsService.getEventById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: "Event not found" });
    return res.status(200).json({ success: true, data: event });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const { order_no, event_date, event_title, media_type, short_description, is_active } = req.body;
    let event_media = "";
    if (req.file) {
      event_media = `/uploads/events/${req.file.filename}`;
    }

    if (!event_media) {
      return res.status(400).json({ success: false, error: "Event media is required." });
    }

    const insertId = await eventsService.createEvent({
      order_no,
      event_date,
      event_title,
      media_type,
      event_media,
      short_description,
      is_active: is_active === "true" || is_active === true ? 1 : 0
    });

    return res.status(201).json({ success: true, message: "Event created successfully.", data: { event_id: insertId } });
  } catch (error) {
    console.error("Create Event Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { order_no, event_date, event_title, media_type, short_description, is_active } = req.body;
    
    let event_media = null;
    if (req.file) {
      event_media = `/uploads/events/${req.file.filename}`;
    }

    const success = await eventsService.updateEvent(id, {
      order_no,
      event_date,
      event_title,
      media_type,
      event_media,
      short_description,
      is_active: is_active === "true" || is_active === true || is_active === 1 || is_active === "1" ? 1 : 0
    });

    if (!success) return res.status(404).json({ success: false, error: "Event not found." });

    return res.status(200).json({ success: true, message: "Event updated successfully." });
  } catch (error) {
    console.error("Update Event Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const success = await eventsService.deleteEvent(req.params.id);
    if (!success) return res.status(404).json({ success: false, error: "Event not found." });
    return res.status(200).json({ success: true, message: "Event deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent
};
